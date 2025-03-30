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
      console.warn('Stripe is not available, but we will continue in development mode');
      
      try {
        // Try to create a payment token even without Stripe
        const response = await fetch('/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error('Failed to create payment intent');
        }
        
        const data = await response.json();
        processingToken = data.processingToken;
        
        if (data.devMode) {
          console.log('Development mode payment initialized');
          return true;
        }
        
        // If we're not in dev mode but Stripe is missing, we can't proceed
        if (!stripe) {
          showError('Payment system is not available');
          return false;
        }
      } catch (error) {
        console.error('Error in dev mode initialization:', error);
        showError('Error initializing payment: ' + error.message);
        return false;
      }
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
      
      // Check if we're in development mode
      if (data.devMode) {
        console.log('Development mode detected, skipping Stripe Elements');
        return true;
      }
      
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
      
      // Clear previous payment element if it exists
      const paymentElementContainer = document.getElementById('payment-element');
      paymentElementContainer.innerHTML = '';
      
      // Create and mount the payment element
      paymentElement = elements.create('payment');
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
      console.log('Stripe or elements not available, trying development mode');
      
      // Try to verify in development mode
      try {
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
        return true;
      } catch (error) {
        console.error('Development mode payment error:', error);
        showPaymentMessage(error.message || 'Payment failed');
        document.getElementById('submit-payment').disabled = false;
        document.getElementById('spinner').classList.add('hidden');
        document.getElementById('button-text').textContent = 'Pay Now';
        return false;
      }
    }
    
    showPaymentMessage('Processing payment...');
    document.getElementById('submit-payment').disabled = true;
    document.getElementById('spinner').classList.remove('hidden');
    document.getElementById('button-text').textContent = 'Processing...';
    
    try {
      console.log('Confirming payment with Stripe...');
      
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
        
        // Some errors we can safely ignore for testing
        if (error.type === 'validation_error' && 
            error.message && 
            (error.message.includes('domain') || error.message.includes('Element is not mounted'))) {
          console.warn('Non-critical error in test mode - proceeding anyway');
        } else {
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
    
    // Check if we're in dev mode with a pre-paid token
    if (!stripe || !elements) {
      console.log('Development mode: proceeding directly to image processing');
      paymentModal.classList.remove('show');
      processImageWithPayment();
      return;
    }
    
    const success = await processPayment();
    if (success) {
      // Continue with image processing
      processImageWithPayment();
    }
  });

  // Handle development mode skip payment
  document.getElementById('skip-payment')?.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('Development mode: Skipping payment');
    
    // Mark as success in development mode
    paymentModal.classList.remove('show');
    
    // Create a token for processing
    if (!processingToken) {
      try {
        const response = await fetch('/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          console.error('Failed to create token');
          return;
        }
        
        const data = await response.json();
        processingToken = data.processingToken;
      } catch (error) {
        console.error('Error creating token:', error);
        return;
      }
    }
    
    // Continue with image processing
    processImageWithPayment();
  });

  // Handle direct development process button
  document.getElementById('devProcessButton')?.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('Development mode: Direct processing');
    
    if (!fileInput.files.length) {
      showError('Please select an image');
      return;
    }
    
    if (!timeframeSelect.value) {
      showError('Please select a timeframe');
      return;
    }

    // Show loading overlay immediately
    loadingOverlay.classList.remove('hidden');
    
    // Create a token for processing
    try {
      console.log('Creating development token...');
      const response = await fetch('/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to create processing token');
      }
      
      const data = await response.json();
      processingToken = data.processingToken;
      
      // Force token to be considered paid on the client side
      console.log('Development token created, proceeding with image processing');
      
      // Process the image
      processImageWithPayment();
    } catch (error) {
      console.error('Error in development processing:', error);
      showError('Error: ' + error.message);
      loadingOverlay.classList.add('hidden');
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
    try {
      const initialized = await initializePayment();
      if (!initialized) {
        showPaymentMessage('Could not initialize payment system. Please try again.');
      } else {
        console.log('Payment form initialized successfully');
      }
    } catch (error) {
      console.error('Error initializing payment:', error);
      showPaymentMessage('Payment initialization error: ' + error.message);
    }
  });
  
  // Process image after payment
  async function processImageWithPayment() {
    console.log('Processing image with payment token:', processingToken);
    
    // Show loading overlay
    loadingOverlay.classList.remove('hidden');
    
    // Create FormData for the file upload
    const formData = new FormData();
    formData.append('tattooImage', fileInput.files[0]);
    formData.append('timeframe', timeframeSelect.value);
    formData.append('processingToken', processingToken);
    
    try {
      console.log('Sending image for processing...');
      
      // Send the image for processing
      const response = await fetch('/process-image', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server returned error:', errorData);
        throw new Error(errorData.error || 'Image processing failed');
      }
      
      const data = await response.json();
      console.log('Processing successful, received data:', data);
      
      // Display the results
      originalImage.src = data.originalImage;
      processedImage.src = data.processedImage;
      timeframeResult.textContent = data.timeframe;
      
      // Show results section, hide form
      resultsSection.classList.remove('hidden');
      
      // Hide loading overlay
      loadingOverlay.classList.add('hidden');
      
    } catch (error) {
      console.error('Error processing image:', error);
      showError(error.message || 'Error processing the image. Please try again.');
      loadingOverlay.classList.add('hidden');
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