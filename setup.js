const fs = require('fs');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
let envExists = false;
let envContent = `PORT=3000\nOPENAI_API_KEY=your_openai_api_key_here\nOPENAI_ORG_ID=your_openai_org_id_here`;

try {
  if (fs.existsSync(envPath)) {
    envExists = true;
    envContent = fs.readFileSync(envPath, 'utf8');
  }
} catch (err) {
  console.error('Error checking .env file:', err);
}

console.log(`
█▀█ █▀▀ █▄░█ █▄▀ █▀█ █░█ █▀▀ █▀█ ▀█▀ █ █▀▄▀█ █▀▀
█ █ ██▄ █░▀█ █░█ █▄█ ▀▄▀ ██▄ █▀▄ ░█░ █ █░▀░█ ██▄

Welcome to InkOverTime Setup!
This script will help you configure your application.
`);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  console.log('Creating uploads directory...');
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Uploads directory created.');
} else {
  console.log('✅ Uploads directory already exists.');
}

// Ask for OpenAI API key
rl.question('\nEnter your OpenAI API key (leave blank to skip): ', (apiKey) => {
  if (apiKey && apiKey.trim() !== '') {
    envContent = envContent.replace(/OPENAI_API_KEY=.*/, `OPENAI_API_KEY=${apiKey.trim()}`);
    console.log('✅ OpenAI API key updated.');
  } else {
    console.log('⚠️ OpenAI API key not provided. You\'ll need to add it manually to .env file later.');
  }
  
  // Ask for OpenAI Organization ID
  rl.question('\nEnter your OpenAI Organization ID (leave blank to skip): ', (orgId) => {
    if (orgId && orgId.trim() !== '') {
      envContent = envContent.replace(/OPENAI_ORG_ID=.*/, `OPENAI_ORG_ID=${orgId.trim()}`);
      console.log('✅ OpenAI Organization ID updated.');
    } else {
      console.log('ℹ️ OpenAI Organization ID not provided. This is optional for most users.');
    }
    
    // Save the .env file
    fs.writeFileSync(envPath, envContent);
    console.log(`\n✅ Configuration saved to ${envPath}`);
    
    console.log(`
Setup completed successfully!

To start the application:
1. Run "npm install" to install dependencies (if you haven't already)
2. Run "npm start" to start the server
3. Open http://localhost:3000 in your browser

Note: The application requires OpenAI API access to GPT-4 Vision and DALL-E 3.
`);
    
    rl.close();
  });
}); 