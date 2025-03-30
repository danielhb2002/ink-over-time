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
    
    showLoading(true);
    
    const formData = new FormData();
    formData.append('tattooImage', fileInput.files[0]);
    formData.append('timeframe', timeframeSelect.value);
    
    try {
      const response = await fetch('/process-image', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        if (errorData.error === 'OpenAI API key not configured') {
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
  });

  // Handle new image button
  newImageButton.addEventListener('click', () => {
    resetFileInput();
    dropzone.classList.remove('hidden');
    previewContainer.classList.add('hidden');
    resultsSection.classList.add('hidden');
    tattooForm.classList.remove('hidden');
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