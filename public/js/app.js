document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const tattooForm = document.getElementById('tattooForm');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('tattooImage');
  const previewContainer = document.getElementById('preview-container');
  const imagePreview = document.getElementById('imagePreview');
  const removeImageBtn = document.getElementById('removeImage');
  const timeframeSelect = document.getElementById('timeframe');
  const processButton = document.getElementById('processButton');
  const resultsSection = document.getElementById('results');
  const originalImage = document.getElementById('originalImage');
  const processedImage = document.getElementById('processedImage');
  const timeframeResult = document.getElementById('timeframeResult');
  const newImageButton = document.getElementById('newImageButton');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const paymentModal = document.getElementById('paymentModal');
  const closeModalBtn = document.querySelector('.close');
  const paymentMessage = document.getElementById('payment-message');

  // Stripe elements
  let stripe = null;
  let elements = null;
  let paymentElement = null;
  let processingToken = null;

  // Initialize Stripe if available
  if (typeof Stripe !== 'undefined' && stripePublicKey) {
    stripe = Stripe(stripePublicKey);
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
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      paymentModal.classList.remove('show');
    });
  }

  // Initialize payment form
  async function initializePayment() {
    if (!stripe) {
      showError('Payment system is not available');
      return false;
    }

    try {
      // Create a payment intent on the server
      const response = await fetch('/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }
      
      const data = await response.json();
      processingToken = data.processingToken;
      
      // Create the payment form elements
      elements = stripe.elements({
        clientSecret: data.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#6b62fd',
          }
        }
      });
      
      // Create and mount the payment element
      paymentElement = elements.create('payment', {
        // In test mode, we can safely ignore domain verification warnings
        loader: 'auto'
      });
      paymentElement.mount('#payment-element');
      
      // Add event listener for when the element is ready
      paymentElement.on('ready', function(event) {
        console.log('Payment element ready');
      });
      
      // Add event listener for any errors
      paymentElement.on('loaderror', function(event) {
        console.warn('Payment element loading error:', event);
        // Continue anyway since we're in test mode
      });
      
      return true;
    } catch (error) {
      console.error('Error initializing payment:', error);
      showError('Error initializing payment: ' + error.message);
      return false;
    }
  }

  // Process payment
  async function processPayment() {
    if (!stripe || !elements) {
      showError('Payment system is not available');
      return false;
    }
    
    showPaymentMessage('Processing payment...');
    document.getElementById('submit-payment').disabled = true;
    document.getElementById('spinner').classList.remove('hidden');
    document.getElementById('button-text').textContent = 'Processing...';
    
    try {
      console.log('Confirming payment...');
      
      // Submit payment to Stripe
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin, // Not used, we stay on the same page
        },
        redirect: 'if_required'
      });
      
      if (error) {
        console.error('Stripe confirmation error:', error);
        
        // Some errors can be ignored in test mode
        if (error.type === 'validation_error' && 
            error.message && 
            error.message.includes('domain')) {
          console.warn('Domain validation error in test mode - continuing anyway');
          // Continue with payment verification
        } else {
          throw error;
        }
      }
      
      console.log('Payment confirmed, verifying with server...');
      
      // Verify payment on the server
      const verifyResponse = await fetch('/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processingToken })
      });
      
      const responseData = await verifyResponse.json();
      
      if (!verifyResponse.ok) {
        throw new Error(responseData.error || 'Payment verification failed');
      }
      
      showPaymentMessage('Payment successful!', 'success');
      paymentModal.classList.remove('show');
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
    
    // Show and initialize payment modal
    paymentModal.classList.add('show');
    
    // Clear any previous payment messages
    paymentMessage.textContent = '';
    paymentMessage.classList.add('hidden');
    
    // Reset payment button state
    const submitButton = document.getElementById('submit-payment');
    if (submitButton) {
      submitButton.disabled = false;
      document.getElementById('spinner')?.classList.add('hidden');
      document.getElementById('button-text').textContent = 'Pay Now';
    }
    
    // Initialize the payment form
    const initialized = await initializePayment();
    if (!initialized) {
      showPaymentMessage('Could not initialize payment system. Please try again.');
    }
  });
  
  // Process image after payment
  async function processImageWithPayment() {
    showLoading(true);
    
    const formData = new FormData();
    formData.append('tattooImage', fileInput.files[0]);
    formData.append('timeframe', timeframeSelect.value);
    formData.append('processingToken', processingToken);
    
    try {
      const response = await fetch('/process-image', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        if (errorData.error === 'Payment required') {
          throw new Error('Payment is required to process your image');
        } else if (errorData.error === 'OpenAI API key not configured') {
          throw new Error(`${errorData.error}: ${errorData.details}`);
        } else {
          throw new Error(errorData.error || 'Error processing image');
        }
      }
      
      const data = await response.json();
      
      // Display results
      originalImage.src = data.originalImage;
      processedImage.src = data.processedImage;
      timeframeResult.textContent = data.timeframe;
      
      // Show demo mode message if applicable
      if (data.demoMode) {
        const demoWarning = document.createElement('div');
        demoWarning.className = 'demo-warning';
        demoWarning.innerHTML = `
          <i class="fas fa-info-circle"></i>
          <p>You're viewing a demo image. Your API key doesn't have sufficient credits to generate real results. 
          Add credits to your OpenAI account or use a different API key to get actual results.</p>
        `;
        resultsSection.prepend(demoWarning);
      }
      
      // Show results section
      tattooForm.classList.add('hidden');
      resultsSection.classList.remove('hidden');
      
    } catch (error) {
      showError(error.message || 'An unexpected error occurred');
    } finally {
      showLoading(false);
    }
  }

  // Handle new image button
  newImageButton.addEventListener('click', () => {
    resetFileInput();
    dropzone.classList.remove('hidden');
    previewContainer.classList.add('hidden');
    resultsSection.classList.add('hidden');
    tattooForm.classList.remove('hidden');
    
    // Remove any demo warnings if they exist
    const demoWarning = resultsSection.querySelector('.demo-warning');
    if (demoWarning) {
      demoWarning.remove();
    }
    
    updateSubmitButton();
  });
  
  // Helper functions
  function resetFileInput() {
    fileInput.value = '';
    imagePreview.src = '#';
  }
  
  function showError(message) {
    alert(message);
  }
  
  function showLoading(show) {
    if (show) {
      loadingOverlay.classList.remove('hidden');
    } else {
      loadingOverlay.classList.add('hidden');
    }
  }
}); 