document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const tattooForm = document.getElementById('tattoo-form');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('tattoo-image');
  const previewContainer = document.getElementById('preview-container');
  const imagePreview = document.getElementById('imagePreview');
  const removeImageBtn = document.getElementById('removeImage');
  const timeframeSelect = document.getElementById('timeframe');
  const processButton = document.getElementById('processButton');
  const resultSection = document.getElementById('result-section');
  const originalImage = document.getElementById('original-image');
  const agedImage = document.getElementById('aged-image');
  const descriptionText = document.getElementById('description-text');
  const loadingOverlay = document.getElementById('loading-overlay');
  const errorMessage = document.getElementById('error-message');
  const paymentModal = document.getElementById('payment-modal');
  const closeModalButton = document.getElementById('close-modal');
  const paymentMessage = document.getElementById('payment-message');
  const fileInfo = document.getElementById('file-info');

  // Stripe Variables
  let stripe;
  let elements;
  let paymentElement;
  let processingToken;

  // Initialize Stripe
  if (stripePublicKey) {
    stripe = Stripe(stripePublicKey);
    console.log('Stripe initialized with public key');
  } else {
    console.error('Stripe public key not found');
  }

  // Drag and drop functionality
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, highlight, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, unhighlight, false);
  });

  function highlight() {
    dropzone.classList.add('dragover');
  }
  
  function unhighlight() {
    dropzone.classList.remove('dragover');
  }

  // Handle file drop
  dropzone.addEventListener('drop', handleDrop, false);
  
  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length) {
      fileInput.files = files;
      handleFileSelect();
    }
  }

  // Handle file selection through input
  fileInput.addEventListener('change', handleFileSelect);
  
  function handleFileSelect() {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      
      // Check if file is an image
      if (!file.type.match('image.*')) {
        showError('Please select an image file (JPEG, PNG, or WebP)');
        resetFileInput();
        return;
      }
      
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showError('File size exceeds 5MB limit');
        resetFileInput();
        return;
      }
      
      // Show image preview
      const reader = new FileReader();
      reader.onload = function(e) {
        imagePreview.src = e.target.result;
        dropzone.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        updateSubmitButton();
      };
      reader.readAsDataURL(file);
    }
  }

  // Remove selected image
  removeImageBtn.addEventListener('click', () => {
    resetFileInput();
    previewContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');
    updateSubmitButton();
  });

  // Handle timeframe selection
  timeframeSelect.addEventListener('change', updateSubmitButton);
  
  function updateSubmitButton() {
    const hasFile = fileInput.files.length > 0;
    const hasTimeframe = timeframeSelect.value !== '';
    
    processButton.disabled = !(hasFile && hasTimeframe);
  }

  // Modal close button
  if (closeModalButton) {
    closeModalButton.addEventListener('click', () => {
      console.log('Close button clicked');
      paymentModal.classList.remove('show');
      paymentModal.style.display = 'none'; // Force display none
    });
  }

  // Process image after payment
  async function processImageWithPayment() {
    // Hide payment modal
    paymentModal.classList.remove('show');
    paymentModal.style.display = 'none';
    
    // Show loading overlay
    loadingOverlay.classList.remove('hidden');
    
    // Get the form data
    const formData = new FormData();
    formData.append('tattooImage', fileInput.files[0]);
    formData.append('timeframe', timeframeSelect.value);
    formData.append('processingToken', processingToken);
    
    try {
      // Send the image for processing
      const response = await fetch('/process-image', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process image');
      }
      
      const data = await response.json();
      
      // Hide loading overlay
      loadingOverlay.classList.add('hidden');
      
      // Display the results
      originalImage.src = data.originalImage;
      agedImage.src = data.processedImage;
      descriptionText.textContent = data.description || 'No analysis available.';
      
      // Show results section
      resultSection.classList.remove('hidden');
      
      // Scroll to results
      resultSection.scrollIntoView({ behavior: 'smooth' });
      
    } catch (error) {
      console.error('Error processing image:', error);
      loadingOverlay.classList.add('hidden');
      showError(error.message || 'Failed to process image. Please try again.');
    }
  }

  // Process payment
  async function processPayment() {
    if (!stripe || !elements) {
      showError('Payment system is not available');
      return false;
    }
    
    // Check if we're in development mode from the server response
    const devMode = document.getElementById('dev-mode-indicator')?.dataset?.devMode === 'true';
    const isLiveStripe = stripePublicKey.startsWith('pk_live');
    
    // Log important state information
    console.log(`Processing payment - Dev mode: ${devMode ? 'Yes' : 'No'}, Stripe mode: ${isLiveStripe ? 'LIVE' : 'TEST'}`);
    
    showPaymentMessage('Processing payment...');
    document.getElementById('submit-payment').disabled = true;
    document.getElementById('spinner').classList.remove('hidden');
    document.getElementById('button-text').textContent = 'Processing...';
    
    try {
      // Never mix dev mode with live keys
      if (devMode && isLiveStripe) {
        console.log('Development mode with live keys detected - using server-side verification only');
        // Skip client-side payment confirmation with live keys in dev mode
        // This avoids the issue where mock client secrets don't work with live Stripe
      } else if (devMode) {
        console.log('Development mode detected - skipping actual payment confirmation');
      } else {
        console.log('Confirming payment with Stripe...');
        
        if (!elements) {
          throw new Error('Payment elements not initialized');
        }
        
        // Submit payment to Stripe
        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: window.location.origin, // Not used, we stay on the same page
          },
          redirect: 'if_required'
        });
        
        // Handle Stripe errors
        if (error) {
          console.error('Stripe confirmation error:', error);
          throw error;
        }
      }
      
      console.log('Payment submitted, verifying with server...');
      
      // Verify payment on the server
      const verifyResponse = await fetch('/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processingToken })
      });
      
      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error || 'Payment verification failed');
      }
      
      const responseData = await verifyResponse.json();
      
      if (!responseData.success) {
        throw new Error('Payment verification failed');
      }
      
      showPaymentMessage('Payment successful!', 'success');
      paymentModal.classList.remove('show');
      paymentModal.style.display = 'none';
      
      // Continue with processing the image
      return true;
    } catch (error) {
      console.error('Payment error:', error);
      showPaymentMessage(error.message || 'Payment failed');
      document.getElementById('submit-payment').disabled = false;
      document.getElementById('spinner').classList.add('hidden');
      document.getElementById('button-text').textContent = 'Pay Now';
      return false;
    }
  }

  // Initialize payment form
  async function initializePayment() {
    if (!stripe) {
      console.error('Stripe not initialized - missing publishable key');
      showError('Payment system is not available. Please ensure you have a proper internet connection and try again.');
      return false;
    }

    try {
      // Log the Stripe key type 
      const isLiveStripe = stripePublicKey.startsWith('pk_live');
      console.log(`Initializing payment with ${isLiveStripe ? 'LIVE' : 'TEST'} Stripe key`);
      
      // Create a payment intent on the server
      const response = await fetch('/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      processingToken = data.processingToken;
      
      console.log('Received client secret format:', data.clientSecret ? 'Valid' : 'Missing', 
                  'Processing token:', processingToken ? 'Valid' : 'Missing',
                  'Dev mode:', data.devMode ? 'Yes' : 'No');
      
      // Update dev mode indicator if present
      const devModeIndicator = document.getElementById('dev-mode-indicator');
      if (devModeIndicator) {
        devModeIndicator.dataset.devMode = data.devMode ? 'true' : 'false';
        console.log(`${data.devMode ? 'Development' : 'Production'} mode detected from server response`);
      }
      
      if (!data.clientSecret) {
        throw new Error('Missing client secret from server');
      }
      
      // Special handling for live keys in dev mode
      if (data.devMode && isLiveStripe) {
        console.log('Warning: Using development mode with live Stripe keys');
        console.log('Only server-side verification will be used');
        
        // In this case, we don't even try to mount the Stripe Elements
        // Since mock client secrets don't work with live keys
        document.getElementById('payment-element').innerHTML = `
          <div class="dev-mode-notice">
            <p>Using development mode with live Stripe keys.</p>
            <p>Click "Pay Now" to test the payment flow.</p>
          </div>
        `;
        document.getElementById('submit-payment').disabled = false;
        return true;
      }
      
      // Create the payment form elements with the returned client secret
      try {
        console.log('Creating Stripe Elements with client secret...');
        elements = stripe.elements({
          clientSecret: data.clientSecret,
          appearance: {
            theme: 'night',
            variables: {
              colorPrimary: '#9e86ff',
              colorBackground: '#1f2937',
              colorText: '#f3f4f6',
              colorDanger: '#ef4444',
              fontFamily: 'Inter, system-ui, sans-serif',
              spacingUnit: '4px',
              borderRadius: '8px'
            }
          }
        });
        
        // Clear previous payment element if it exists
        const paymentElementContainer = document.getElementById('payment-element');
        paymentElementContainer.innerHTML = '';
        
        // Create and mount the payment element
        console.log('Creating payment element...');
        paymentElement = elements.create('payment');
        
        console.log('Mounting payment element...');
        paymentElement.mount('#payment-element');
        console.log('Payment element mounted to DOM');
        
        // Add event listener for when the element is ready
        return new Promise((resolve) => {
          // Enable button when element is ready
          paymentElement.on('ready', function() {
            console.log('Payment element ready event fired');
            document.getElementById('submit-payment').disabled = false;
            resolve(true);
          });
          
          // Add error listener
          paymentElement.on('loaderror', function(event) {
            console.error('Payment element loading error:', event);
            
            // Special handling for live mode errors
            if (isLiveStripe) {
              console.log('Live mode error - falling back to simple form');
              document.getElementById('payment-element').innerHTML = `
                <div class="dev-mode-notice">
                  <p>Payment form could not be loaded with live keys in test mode.</p>
                  <p>Click "Pay Now" to continue with the test flow.</p>
                </div>
              `;
              document.getElementById('submit-payment').disabled = false;
              resolve(true);
              return;
            }
            
            showPaymentMessage('Error loading payment form: ' + (event.error?.message || 'Unknown error'));
            resolve(false);
          });
          
          // Set a timeout in case the element never loads
          setTimeout(() => {
            if (document.getElementById('submit-payment').disabled) {
              console.warn('Payment element did not become ready in time');
              
              // Special handling for live mode timeouts
              if (isLiveStripe) {
                console.log('Live mode timeout - falling back to simple form');
                document.getElementById('payment-element').innerHTML = `
                  <div class="dev-mode-notice">
                    <p>Payment form timed out with live keys in test mode.</p>
                    <p>Click "Pay Now" to continue with the test flow.</p>
                  </div>
                `;
                document.getElementById('submit-payment').disabled = false;
                resolve(true);
                return;
              }
              
              showPaymentMessage('Payment form took too long to load. Try again or refresh the page.');
              resolve(false);
            }
          }, 10000);
        });
      } catch (stripeError) {
        console.error('Error creating Stripe Elements:', stripeError);
        
        // Special handling for live mode errors
        if (isLiveStripe) {
          console.log('Live mode error - falling back to simple form');
          document.getElementById('payment-element').innerHTML = `
            <div class="dev-mode-notice">
              <p>Payment form could not be initialized with live keys in test mode.</p>
              <p>Click "Pay Now" to continue with the test flow.</p>
            </div>
          `;
          document.getElementById('submit-payment').disabled = false;
          return true;
        }
        
        throw stripeError;
      }
    } catch (error) {
      console.error('Error initializing payment:', error);
      showPaymentMessage('Error initializing payment: ' + error.message);
      return false;
    }
  }

  // Show payment message
  function showPaymentMessage(message, type = 'error') {
    paymentMessage.textContent = message;
    paymentMessage.className = 'payment-message';
    if (type === 'success') {
      paymentMessage.classList.add('success');
    }
    paymentMessage.classList.remove('hidden');
  }

  // Handle payment form submission
  document.getElementById('submit-payment')?.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Check if payment element is ready
    if (!elements) {
      showPaymentMessage('Payment system is still initializing. Please wait a moment and try again.');
      return;
    }
    
    const success = await processPayment();
    if (success) {
      // Continue with image processing
      processImageWithPayment();
    }
  });

  // Handle form submission
  tattooForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!fileInput.files.length) {
      showError('Please select an image');
      return;
    }
    
    if (!timeframeSelect.value) {
      showError('Please select a timeframe');
      return;
    }
    
    console.log('Form submitted, showing payment modal');
    
    // Show and initialize payment modal
    paymentModal.classList.add('show');
    paymentModal.style.display = 'flex'; // Force display flex
    
    console.log('Payment modal visibility:', paymentModal.style.display, 'Class list:', paymentModal.className);
    
    // Clear any previous payment messages
    paymentMessage.textContent = '';
    paymentMessage.classList.add('hidden');
    
    // Reset payment button state
    const submitButton = document.getElementById('submit-payment');
    if (submitButton) {
      submitButton.disabled = true; // Disable until the payment element is ready
      document.getElementById('spinner')?.classList.add('hidden');
      document.getElementById('button-text').textContent = 'Pay Now';
    }
    
    // Add hidden indicator for development mode
    const devModeIndicator = document.createElement('div');
    devModeIndicator.id = 'dev-mode-indicator';
    devModeIndicator.style.display = 'none';
    devModeIndicator.dataset.devMode = 'false';
    paymentModal.appendChild(devModeIndicator);
    
    // Initialize the payment form
    try {
      const initialized = await initializePayment();
      if (!initialized) {
        console.warn('Payment initialization failed');
        showPaymentMessage('Could not initialize payment system. Please try again.');
      } else {
        console.log('Payment form initialized successfully');
      }
    } catch (error) {
      console.error('Error initializing payment:', error);
      showPaymentMessage('Payment initialization error: ' + error.message);
    }
  });
  
  // Helper functions
  function resetFileInput() {
    fileInput.value = '';
    imagePreview.src = '#';
  }
  
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
      errorMessage.classList.add('hidden');
    }, 5000);
  }
  
  function showLoading(show) {
    if (show) {
      loadingOverlay.classList.remove('hidden');
    } else {
      loadingOverlay.classList.add('hidden');
    }
  }
}); 