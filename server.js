require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

// Set up OpenAI client
const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY,
};

const openai = new OpenAI(openaiConfig);

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Set up static folder
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON in request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set payment amount
const PAYMENT_AMOUNT = 299; // £2.99 in pence

// In-memory store of processing tokens (in production, use a database)
const processingTokens = new Map();

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only .jpeg, .jpg, .png, and .webp files are allowed'));
  }
});

// Routes
app.get('/', (req, res) => {
  // Check if OpenAI API key is configured
  const apiKeyConfigured = process.env.OPENAI_API_KEY && 
                          process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';
  
  // Add demo mode flag - set to false to use the real API
  const demoMode = false; // Disabled demo mode to use real API
  
  res.render('index', { 
    apiKeyConfigured, 
    demoMode,
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY || 'pk_test_placeholder',
    paymentAmount: (PAYMENT_AMOUNT / 100).toFixed(2) // Convert to pounds for display
  });
});

// Create a Stripe payment intent
app.post('/create-payment-intent', async (req, res) => {
  try {
    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: PAYMENT_AMOUNT,
      currency: 'gbp',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Store a reference to this payment for verification later
    const processingToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
    processingTokens.set(processingToken, {
      paymentIntentId: paymentIntent.id,
      paid: false,
      timestamp: Date.now()
    });

    // Return the client secret and processing token to the client
    res.json({
      clientSecret: paymentIntent.client_secret,
      processingToken: processingToken
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Endpoint to verify payment was successful before processing
app.post('/verify-payment', async (req, res) => {
  try {
    const { processingToken } = req.body;
    
    if (!processingToken || !processingTokens.has(processingToken)) {
      return res.status(400).json({ error: 'Invalid processing token' });
    }
    
    const tokenData = processingTokens.get(processingToken);
    
    // Check if payment is already marked as paid
    if (tokenData.paid) {
      return res.json({ success: true });
    }
    
    // Verify the payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(tokenData.paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Mark as paid
      tokenData.paid = true;
      processingTokens.set(processingToken, tokenData);
      
      return res.json({ success: true });
    }
    
    return res.status(402).json({ error: 'Payment required', paymentStatus: paymentIntent.status });
    
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Handle the file upload and processing with payment verification
app.post('/process-image', upload.single('tattooImage'), async (req, res) => {
  try {
    const { processingToken } = req.body;
    
    // Verify the payment token exists and is marked as paid
    if (!processingToken || !processingTokens.has(processingToken)) {
      return res.status(400).json({ error: 'Invalid payment token' });
    }
    
    const tokenData = processingTokens.get(processingToken);
    if (!tokenData.paid) {
      return res.status(402).json({ error: 'Payment required' });
    }
    
    // Continue with the rest of the processing
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    
    const timeframe = req.body.timeframe;
    if (!timeframe) {
      return res.status(400).json({ error: 'No timeframe specified' });
    }
    
    const imagePath = '/uploads/' + req.file.filename;
    const fullImagePath = path.join(__dirname, 'public', imagePath);
    
    // Convert image to base64 for display
    const imageBuffer = fs.readFileSync(fullImagePath);
    const imageBase64 = imageBuffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${imageBase64}`;
    
    let tattooDescription = "A tattoo";
    
    // Try to use Vision API but have a fallback
    try {
      const vision = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a tattoo expert. Describe the uploaded tattoo image in detail, focusing on colors, style, design elements, and placement. Be concise but detailed."
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this tattoo in detail:" },
              {
                type: "image_url",
                image_url: {
                  url: dataURI,
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      });
      
      tattooDescription = vision.choices[0].message.content;
      console.log("Successfully analyzed tattoo:", tattooDescription);
    } catch (visionError) {
      console.error('Error analyzing image with Vision API:', visionError);
      tattooDescription = "A tattoo that needs to show aging effects";
      // Continue with the basic description
    }
    
    // Now use DALL-E 3 to generate the aged version
    try {
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: `Generate a realistic image showing how this tattoo would look after ${timeframe} of aging. The tattoo is: ${tattooDescription}. Show natural fading, blurring, and color changes that occur over time with tattoos. The image should look realistic and medically accurate, not artistic or stylized. Show the effects of skin aging, sun exposure, and ink degradation over time.`,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        style: "natural"
      });
      
      const resultImageUrl = response.data[0].url;
      
      // After successful processing, remove the token from memory
      processingTokens.delete(processingToken);
      
      // Return both original and processed images
      res.json({
        originalImage: imagePath,
        processedImage: resultImageUrl,
        timeframe: timeframe
      });
    } catch (dalleError) {
      console.error('Error generating image with DALL-E:', dalleError);
      return res.status(500).json({ 
        error: 'OpenAI API Error', 
        details: dalleError.message,
        message: 'There was an error with the OpenAI API. You may need to check your API key or account credits.'
      });
    }
    
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: 'Error processing image', details: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`InkOverTime app listening at http://localhost:${port}`);
}); 