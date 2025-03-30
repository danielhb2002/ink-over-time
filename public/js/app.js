document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const tattooForm = document.getElementById('tattoo-form');
  const fileInput = document.getElementById('tattoo-image');
  const fileInfo = document.getElementById('file-info');
  const timeframeSelect = document.getElementById('timeframe');
  const resultSection = document.getElementById('result-section');
  const originalImage = document.getElementById('original-image');
  const agedImage = document.getElementById('aged-image');
  const descriptionText = document.getElementById('description-text');
  const loadingOverlay = document.getElementById('loading-overlay');
  const errorMessage = document.getElementById('error-message');
  const paymentModal = document.getElementById('payment-modal');
  const closeModalButton = document.getElementById('close-modal');
  const paymentMessage = document.getElementById('payment-message');
  const submitButton = tattooForm ? tattooForm.querySelector('.submit-button') : null;

  // Stripe Variables
  let stripe;
  let elements;
  let paymentElement;
  let processingToken;

  // Initialize Stripe
  if (typeof stripePublicKey !== 'undefined' && stripePublicKey) {
    stripe = Stripe(stripePublicKey);
    console.log('Stripe initialized with public key');
  } else {
    console.error('Stripe public key not found');
  }

  // File Input Change Handler
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
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
        
        const fileName = fileInput.files[0].name;
        if (fileInfo) fileInfo.textContent = fileName;
        
        // Validate form
        validateForm();
      } else {
        if (fileInfo) fileInfo.textContent = 'No file selected';
        validateForm();
      }
    });
  }

  // Helper function to reset file input
  function resetFileInput() {
    if (fileInput) fileInput.value = '';
    if (fileInfo) fileInfo.textContent = 'No file selected';
    validateForm();
  }

  // Validate form inputs
  function validateForm() {
    if (!submitButton) return;
    
    const fileSelected = fileInput && fileInput.files.length > 0;
    const timeSelected = timeframeSelect && timeframeSelect.value !== '';
    
    submitButton.disabled = !(fileSelected && timeSelected);
  }

  // Timeframe selection change
  if (timeframeSelect) {
    timeframeSelect.addEventListener('change', validateForm);
  }

  // Show error message
  function showError(message) {
    if (!errorMessage) return;
    
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
      errorMessage.classList.add('hidden');
    }, 5000);
  }

  // Close modal button event
  if (closeModalButton) {
    closeModalButton.addEventListener('click', function() {
      console.log('Close button clicked');
      if (paymentModal) {
        paymentModal.classList.remove('show');
        paymentModal.style.display = 'none'; // Force display none
      }
    });
  }

  // Process image after payment
  async function processImageWithPayment() {
    if (!paymentModal || !loadingOverlay || !fileInput || !timeframeSelect) return;
    
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
      if (originalImage) originalImage.src = data.originalImage;
      if (agedImage) agedImage.src = data.processedImage;
      if (descriptionText) descriptionText.textContent = data.description || 'No analysis available.';
      
      // Show results section
      if (resultSection) {
        resultSection.classList.remove('hidden');
        
        // Scroll to results
        resultSection.scrollIntoView({ behavior: 'smooth' });
      }
      
    } catch (error) {
      console.error('Error processing image:', error);
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
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
    const submitButton = document.getElementById('submit-payment');
    const spinner = document.getElementById('spinner');
    const buttonText = document.getElementById('button-text');
    
    if (submitButton) submitButton.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    if (buttonText) buttonText.textContent = 'Processing...';
    
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
      if (paymentModal) {
        paymentModal.classList.remove('show');
        paymentModal.style.display = 'none';
      }
      
      // Continue with processing the image
      return true;
    } catch (error) {
      console.error('Payment error:', error);
      showPaymentMessage(error.message || 'Payment failed');
      if (submitButton) submitButton.disabled = false;
      if (spinner) spinner.classList.add('hidden');
      if (buttonText) buttonText.textContent = 'Pay Now';
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
      
      const paymentElement = document.getElementById('payment-element');
      const submitButton = document.getElementById('submit-payment');
      
      // Special handling for live keys in dev mode
      if (data.devMode && isLiveStripe) {
        console.log('Warning: Using development mode with live Stripe keys');
        console.log('Only server-side verification will be used');
        
        // In this case, we don't even try to mount the Stripe Elements
        // Since mock client secrets don't work with live keys
        if (paymentElement) {
          paymentElement.innerHTML = `
            <div class="dev-mode-notice">
              <p>Using development mode with live Stripe keys.</p>
              <p>Click "Pay Now" to test the payment flow.</p>
            </div>
          `;
        }
        
        if (submitButton) submitButton.disabled = false;
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
        if (paymentElement) {
          paymentElement.innerHTML = '';
        } else {
          console.error('Payment element container not found in the DOM');
          return false;
        }
        
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
            if (submitButton) submitButton.disabled = false;
            resolve(true);
          });
          
          // Add error listener
          paymentElement.on('loaderror', function(event) {
            console.error('Payment element loading error:', event);
            
            // Special handling for live mode errors
            if (isLiveStripe) {
              console.log('Live mode error - falling back to simple form');
              if (paymentElement) {
                paymentElement.innerHTML = `
                  <div class="dev-mode-notice">
                    <p>Payment form could not be loaded with live keys in test mode.</p>
                    <p>Click "Pay Now" to continue with the test flow.</p>
                  </div>
                `;
              }
              if (submitButton) submitButton.disabled = false;
              resolve(true);
              return;
            }
            
            showPaymentMessage('Error loading payment form: ' + (event.error?.message || 'Unknown error'));
            resolve(false);
          });
          
          // Set a timeout in case the element never loads
          setTimeout(() => {
            if (submitButton && submitButton.disabled) {
              console.warn('Payment element did not become ready in time');
              
              // Special handling for live mode timeouts
              if (isLiveStripe) {
                console.log('Live mode timeout - falling back to simple form');
                if (paymentElement) {
                  paymentElement.innerHTML = `
                    <div class="dev-mode-notice">
                      <p>Payment form timed out with live keys in test mode.</p>
                      <p>Click "Pay Now" to continue with the test flow.</p>
                    </div>
                  `;
                }
                if (submitButton) submitButton.disabled = false;
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
          if (paymentElement) {
            paymentElement.innerHTML = `
              <div class="dev-mode-notice">
                <p>Payment form could not be initialized with live keys in test mode.</p>
                <p>Click "Pay Now" to continue with the test flow.</p>
              </div>
            `;
          }
          if (submitButton) submitButton.disabled = false;
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
    if (!paymentMessage) return;
    
    paymentMessage.textContent = message;
    paymentMessage.className = 'payment-message';
    if (type === 'success') {
      paymentMessage.classList.add('success');
    }
    paymentMessage.classList.remove('hidden');
  }

  // Handle payment form submission
  const submitPaymentButton = document.getElementById('submit-payment');
  if (submitPaymentButton) {
    submitPaymentButton.addEventListener('click', async (e) => {
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
  }

  // Handle form submission
  if (tattooForm) {
    tattooForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!fileInput || !fileInput.files.length) {
        showError('Please select an image');
        return;
      }
      
      if (!timeframeSelect || !timeframeSelect.value) {
        showError('Please select a timeframe');
        return;
      }
      
      console.log('Form submitted, showing payment modal');
      
      // Show and initialize payment modal
      if (paymentModal) {
        paymentModal.classList.add('show');
        paymentModal.style.display = 'flex'; // Force display flex
        
        console.log('Payment modal visibility:', paymentModal.style.display, 'Class list:', paymentModal.className);
        
        // Clear any previous payment messages
        if (paymentMessage) {
          paymentMessage.textContent = '';
          paymentMessage.classList.add('hidden');
        }
        
        // Reset payment button state
        const submitButton = document.getElementById('submit-payment');
        const spinner = document.getElementById('spinner');
        const buttonText = document.getElementById('button-text');
        
        if (submitButton) {
          submitButton.disabled = true; // Disable until the payment element is ready
        }
        
        if (spinner) {
          spinner.classList.add('hidden');
        }
        
        if (buttonText) {
          buttonText.textContent = 'Pay Now';
        }
        
        // Add hidden indicator for development mode
        let devModeIndicator = document.getElementById('dev-mode-indicator');
        if (!devModeIndicator) {
          devModeIndicator = document.createElement('div');
          devModeIndicator.id = 'dev-mode-indicator';
          devModeIndicator.style.display = 'none';
          devModeIndicator.dataset.devMode = 'false';
          paymentModal.appendChild(devModeIndicator);
        }
        
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
      } else {
        console.error('Payment modal not found in the DOM');
      }
    });
  }
}); 