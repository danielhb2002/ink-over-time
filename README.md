# InkOverTime

InkOverTime is a web application that shows how tattoos will age over time using AI. Users can upload an image of a tattoo and select a timeframe to see how the tattoo might look after that period.

## Live Demo

You can view a live demo of the application at: [Your Deployment URL will be here]

## Features

- Upload tattoo images via drag & drop or file browser
- Select timeframes from 1 to 30 years
- View side-by-side comparison of original and aged tattoo
- Mobile-responsive design
- Uses GPT-4 Vision to analyze tattoo details
- Uses DALL-E 3 to generate realistic aging simulations

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- OpenAI API key with access to:
  - GPT-4 Vision API
  - DALL-E 3 API

## Installation

1. Clone this repository or download the source code
2. Navigate to the project directory
3. Install dependencies:
   ```
   npm install
   ```
4. Run the setup script to configure your environment:
   ```
   npm run setup
   ```
   This will guide you through setting up your OpenAI API key and organization ID.

   Alternatively, you can manually create a `.env` file in the root directory with the following variables:
   ```
   PORT=3000
   OPENAI_API_KEY=your_openai_api_key_here
   ```
   Replace `your_openai_api_key_here` with your actual OpenAI API key.

## Deployment

### Deploying to Render.com

1. Create a Render.com account at https://render.com
2. Create a new Web Service
3. Connect your GitHub repository or upload your code directly
4. Configure your deployment:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables: Add your `OPENAI_API_KEY`
5. Deploy your application

## Usage

1. Start the server:
   ```
   npm start
   ```
   For development with auto-restart:
   ```
   npm run dev
   ```

2. Open a web browser and navigate to:
   ```
   http://localhost:3000
   ```

3. Upload a tattoo image using the drag & drop area or file browser

4. Select a timeframe from the dropdown menu

5. Click "See How It Ages" to view the result

## Technology Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Image Processing: OpenAI APIs
  - GPT-4 Vision for tattoo analysis
  - DALL-E 3 for image generation
- File Handling: Multer
- Templating: EJS

## How It Works

1. The user uploads an image of a tattoo
2. GPT-4 Vision analyzes the tattoo and creates a detailed description
3. DALL-E 3 uses this description to generate a realistic aged version based on the selected timeframe
4. The results are displayed side-by-side for comparison

## API Usage and Costs

This application uses two OpenAI APIs:
- GPT-4 Vision API for analyzing uploaded images
- DALL-E 3 API for generating aged versions of tattoos

Please be aware of OpenAI's pricing for these services:
- GPT-4 Vision: $0.01 per image
- DALL-E 3 (Standard quality): $0.02 per 1024x1024 image

## Notes

- The app requires an OpenAI API key with access to GPT-4 Vision and DALL-E 3
- The maximum upload file size is limited to 5MB
- Supported image formats are JPEG, PNG, and WebP

## License

This project is available for personal and commercial use.

## Disclaimer

The results provided by this application are AI-generated and for informational purposes only. Actual tattoo aging may differ based on various factors such as ink quality, placement, skin type, sun exposure, and aftercare. 