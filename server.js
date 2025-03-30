require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

// Determine environment
const isDevelopment = process.env.NODE_ENV === 'development';
console.log(`Running in ${isDevelopment ? 'development' : 'production'} mode`);

// Configure Stripe with fallback
let stripeKey = process.env.STRIPE_SECRET_KEY;
// If the key starts with sk_live, we're in live mode
const isLiveMode = stripeKey && stripeKey.startsWith('sk_live');
console.log(`Stripe mode: ${isLiveMode ? 'LIVE' : 'TEST'}`);

// Initialize Stripe only if we have a key or are in development mode
let stripe;
try {
  if (stripeKey) {
    stripe = require('stripe')(stripeKey);
    console.log('Stripe initialized with provided API key');
  } else if (isDevelopment) {
    // In development, create a mock Stripe instance
    console.log('Development mode: Using mock Stripe functionality');
    stripe = {
      paymentIntents: {
        create: async () => ({
          id: 'pi_' + Date.now(),
          client_secret: 'pi_' + Date.now() + '_secret_' + Math.random().toString(36).substring(2)
        }),
        retrieve: async () => ({ status: 'succeeded' })
      }
    };
  } else {
    // In production, we need a real key
    throw new Error('Stripe API key is required in production mode');
  }
} catch (error) {
  console.error('Error initializing Stripe:', error);
  if (!isDevelopment) {
    process.exit(1); // Exit in production, but continue in development
  }
}

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
  
  // Send the correct Stripe public key based on mode (test or live)
  const stripePublicKey = isLiveMode 
    ? process.env.STRIPE_LIVE_PUBLIC_KEY || process.env.STRIPE_PUBLIC_KEY 
    : process.env.STRIPE_PUBLIC_KEY;
  
  res.render('index', { 
    apiKeyConfigured, 
    demoMode,
    process: { env: { NODE_ENV: process.env.NODE_ENV || 'production' } },
    stripePublicKey: stripePublicKey || 'pk_test_placeholder',
    paymentAmount: (PAYMENT_AMOUNT / 100).toFixed(2) // Convert to pounds for display
  });
});

// Create a Stripe payment intent
app.post('/create-payment-intent', async (req, res) => {
  try {
    console.log('Creating payment intent...');
    
    // Check if we're using a live key
    const usingLiveStripe = stripeKey && stripeKey.startsWith('sk_live');
    console.log(`Payment intent using ${usingLiveStripe ? 'LIVE' : 'TEST'} Stripe mode`);
    
    if (isDevelopment && !usingLiveStripe) {
      console.log('Development mode: Creating mock payment intent');
      // Generate a valid fake client secret for development
      const paymentIntentId = 'pi_' + Date.now();
      const secretSuffix = Math.random().toString(36).substring(2);
      const processingToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
      
      // Store the reference - pre-mark as paid in dev mode
      processingTokens.set(processingToken, {
        paymentIntentId: paymentIntentId,
        paid: true, // Already mark as paid to skip verification issues
        timestamp: Date.now()
      });
      
      console.log('Development mode: Created processing token:', processingToken);
      
      // Return the mock client secret - MUST be in format 'pi_XXX_secret_YYY'
      return res.json({
        clientSecret: `${paymentIntentId}_secret_${secretSuffix}`,
        processingToken: processingToken,
        devMode: true
      });
    }
    
    // Production mode or live key mode - use real Stripe API
    try {
      // Create a PaymentIntent with the real Stripe API
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

      console.log('Created payment intent with ID:', paymentIntent.id);
      
      // Return the client secret and processing token to the client
      return res.json({
        clientSecret: paymentIntent.client_secret,
        processingToken: processingToken,
        // Never send devMode=true for real Stripe API calls
        devMode: false
      });
    } catch (stripeError) {
      console.error('Stripe API error:', stripeError);
      throw stripeError;
    }
  } catch (error) {
    console.error('Error creating payment intent:', error);
    
    // In development mode, create a mock payment intent even on error
    if (isDevelopment && !stripeKey.startsWith('sk_live')) {
      console.log('Development mode: Creating mock payment intent after error');
      
      // Generate a fake client secret for development - MUST be in format 'pi_XXX_secret_YYY'
      const paymentIntentId = 'pi_' + Date.now();
      const secretSuffix = Math.random().toString(36).substring(2);
      const processingToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
      
      // Store the reference - pre-mark as paid in dev mode
      processingTokens.set(processingToken, {
        paymentIntentId: paymentIntentId,
        paid: true, // Already mark as paid to skip verification issues
        timestamp: Date.now()
      });
      
      console.log('Development mode: Created processing token after error:', processingToken);
      
      // Return the mock client secret
      return res.json({
        clientSecret: `${paymentIntentId}_secret_${secretSuffix}`,
        processingToken: processingToken,
        devMode: true
      });
    }
    
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Endpoint to verify payment was successful before processing
app.post('/verify-payment', async (req, res) => {
  try {
    const { processingToken } = req.body;
    
    console.log('Verifying payment token:', processingToken);
    
    if (!processingToken || !processingTokens.has(processingToken)) {
      console.error('Invalid or missing processing token:', processingToken);
      return res.status(400).json({ error: 'Invalid processing token' });
    }
    
    const tokenData = processingTokens.get(processingToken);
    
    // Check if payment is already marked as paid
    if (tokenData.paid) {
      console.log('Token already marked as paid:', processingToken);
      return res.json({ success: true });
    }
    
    // Development mode special handling
    if (isDevelopment) {
      console.log('Development mode: Allowing payment verification without Stripe');
      tokenData.paid = true;
      processingTokens.set(processingToken, tokenData);
      return res.json({ success: true });
    }
    
    // Verify the payment with Stripe
    try {
      console.log('Retrieving payment intent from Stripe:', tokenData.paymentIntentId);
      const paymentIntent = await stripe.paymentIntents.retrieve(tokenData.paymentIntentId);
      console.log('Payment intent retrieved, status:', paymentIntent.status);
      
      if (paymentIntent.status === 'succeeded' || 
          paymentIntent.status === 'requires_capture' || 
          paymentIntent.status === 'processing') {
        // Mark as paid
        console.log('Payment verified as successful, marking token as paid');
        tokenData.paid = true;
        processingTokens.set(processingToken, tokenData);
        
        return res.json({ success: true });
      }
      
      return res.status(402).json({ error: 'Payment required', paymentStatus: paymentIntent.status });
    } catch (stripeError) {
      console.error('Stripe error retrieving payment intent:', stripeError);
      return res.status(500).json({ error: 'Failed to verify payment with Stripe' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Handle the file upload and processing with payment verification
app.post('/process-image', upload.single('tattooImage'), async (req, res) => {
  try {
    const { processingToken } = req.body;
    
    console.log('Processing image request with token:', processingToken);
    
    // Verify the payment token exists and is marked as paid
    if (!processingToken || !processingTokens.has(processingToken)) {
      console.error('Invalid payment token:', processingToken);
      return res.status(400).json({ error: 'Invalid payment token' });
    }
    
    const tokenData = processingTokens.get(processingToken);
    
    // Development mode special handling
    if (isDevelopment) {
      console.log('Development mode: Allowing processing without payment verification');
      // No need to check payment status in development
    } else if (!tokenData.paid) {
      console.error('Payment required for token:', processingToken);
      return res.status(402).json({ error: 'Payment required' });
    }
    
    // Continue with the rest of the processing
    if (!req.file) {
      console.error('No image file uploaded');
      return res.status(400).json({ error: 'No image uploaded' });
    }
    
    const timeframe = req.body.timeframe;
    if (!timeframe) {
      console.error('No timeframe specified');
      return res.status(400).json({ error: 'No timeframe specified' });
    }
    
    console.log('Processing image:', req.file.filename, 'with timeframe:', timeframe);
    
    const imagePath = '/uploads/' + req.file.filename;
    const fullImagePath = path.join(__dirname, 'public', imagePath);
    
    // Convert image to base64 for display
    const imageBuffer = fs.readFileSync(fullImagePath);
    const imageBase64 = imageBuffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${imageBase64}`;
    
    let tattooDescription = "A tattoo";
    
    // Try to use Vision API but have a fallback
    try {
      console.log('Analyzing tattoo with Vision API...');
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
      console.log('Using fallback tattoo description');
      // Continue with the basic description
    }
    
    // Now use DALL-E 3 to generate the aged version
    try {
      console.log('Generating aged tattoo image with DALL-E...');
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: `Generate a realistic image showing how this tattoo would look after ${timeframe} of aging. The tattoo is: ${tattooDescription}. Show natural fading, blurring, and color changes that occur over time with tattoos. The image should look realistic and medically accurate, not artistic or stylized. Show the effects of skin aging, sun exposure, and ink degradation over time.`,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        style: "natural"
      });
      
      const resultImageUrl = response.data[0].url;
      console.log('Successfully generated aged tattoo image');
      
      // After successful processing, remove the token from memory
      processingTokens.delete(processingToken);
      console.log('Processing token deleted after successful processing');
      
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