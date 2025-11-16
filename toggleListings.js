require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

// Get action from environment variable (set by GitHub Actions workflow)
const ACTION = process.env.ACTION || 'toggle';

// Define all properties to manage
const PROPERTIES = [
  { propertyName: "B9", airbnbListingName: "B9" }
  // Add more properties here as needed
];


// Function to fetch verification link from Gmail
async function getVerificationLinkFromGmail(browser) {
  console.log('[INFO] Fetching verification link from Gmail...');
  
  const gmailPage = await browser.newPage();
  
  try {
    // Navigate to Gmail
    console.log('[INFO] Navigating to Gmail...');
    await gmailPage.goto('https://mail.google.com', { waitUntil: 'networkidle' });
    await gmailPage.waitForTimeout(2000);
    
    // Check if already logged in or need to login
    const currentUrl = gmailPage.url();
    if (currentUrl.includes('accounts.google.com')) {
      console.log('[INFO] Logging into Gmail...');
      
      // Fill in email
      await gmailPage.fill('input[type="email"]', process.env.GMAIL_EMAIL);
      await gmailPage.waitForTimeout(500);
      await gmailPage.keyboard.press('Enter');
      await gmailPage.waitForTimeout(2000);
      
      // Fill in password
      await gmailPage.fill('input[type="password"]', process.env.GMAIL_PASSWORD);
      await gmailPage.waitForTimeout(500);
      await gmailPage.keyboard.press('Enter');
      await gmailPage.waitForTimeout(5000); // Wait for login to complete
    }
    
    // Wait for Gmail inbox to load
    console.log('[INFO] Waiting for Gmail inbox to load...');
    await gmailPage.waitForSelector('table[role="grid"]', { timeout: 15000 });
    await gmailPage.waitForTimeout(2000);
    
    // Search for Hospitable verification email
    console.log('[INFO] Searching for Hospitable verification email...');
    await gmailPage.fill('input[aria-label="Search mail"]', 'from:support@hospitable.com subject:"New login to Hospitable"');    await gmailPage.waitForTimeout(500);
    await gmailPage.keyboard.press('Enter');
    await gmailPage.waitForTimeout(3000);
    
    // Click on the first email
    console.log('[INFO] Opening verification email...');
    const firstEmail = await gmailPage.waitForSelector('table[role="grid"] tr.zA', { timeout: 10000 });
    await firstEmail.click();
    await gmailPage.waitForTimeout(2000);
    
    // Extract verification link from email
    console.log('[INFO] Extracting verification link...');
    const emailContent = await gmailPage.textContent('body');
    
    // Look for Hospitable verification link pattern
    const linkMatch = emailContent.match(/https:\/\/my\.hospitable\.com\/user\/email-login\/[a-zA-Z0-9-_]+/);
    
    if (linkMatch && linkMatch[0]) {
      const verificationLink = linkMatch[0];
      console.log('[INFO] Found verification link:', verificationLink);
      await gmailPage.close();
      return verificationLink;
    } else {
      console.log('[ERROR] Could not find verification link in email');
      await gmailPage.close();
      return null;
    }
    
  } catch (error) {
    console.log('[ERROR] Failed to get verification link from Gmail:', error.message);
    await gmailPage.close();
    return null;
  }
}

// Check if it's weekend mode (Friday 6 PM PST to Monday 8 AM PST)
function isWeekendMode() {
  const now = new Date();
  // Convert to PST (UTC-8)
  const pstOffset = -8 * 60; // PST is UTC-8
  const pstTime = new Date(now.getTime() + (pstOffset + now.getTimezoneOffset()) * 60 * 1000);
  
  const day = pstTime.getDay(); // 0=Sunday, 5=Friday, 1=Monday
  const hour = pstTime.getHours();
  
  // Friday 18:00 (6 PM) onwards
  if (day === 5 && hour >= 18) return true;
  
  // All of Saturday (day 6)
  if (day === 6) return true;
  
  // All of Sunday (day 0)
  if (day === 0) return true;
  
  // Monday before 8 AM
  if (day === 1 && hour < 8) return true;
  
  return false;
}

// Determine the action based on weekend mode or explicit ACTION
function determineAction() {
  // If we're in weekend mode, always list
  if (isWeekendMode()) {
    console.log('[INFO] Weekend mode active - keeping all listings published');
    return 'list';
  }
  
  // Otherwise, use the ACTION from the workflow
  console.log(`[INFO] Running with action: ${ACTION}`);
  return ACTION;
}

(async () => {
  const action = determineAction();
  
  // Determine what to do based on action
  const listingActions = [];
  
  if (action === 'list') {
    // List all properties
    for (const prop of PROPERTIES) {
      listingActions.push({ ...prop, action: 'list' });
    }
  } else if (action === 'unlist') {
    // Unlist all properties
    for (const prop of PROPERTIES) {
      listingActions.push({ ...prop, action: 'unlist' });
    }
  } else {
    console.log('[ERROR] Unknown action:', action);
    process.exit(1);
  }
  
  console.log(`[INFO] Starting automation - Action: ${action}`);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to login page
  console.log('[INFO] Navigating to Hospitable...');
  await page.goto('https://my.hospitable.com/user/hello', { waitUntil: 'networkidle' });
  
  // Fill in login credentials
  console.log('[INFO] Entering credentials...');
  await page.fill('input[type="email"]', process.env.HOSPITABLE_EMAIL);
  await page.waitForTimeout(500); // Small delay for form validation
  await page.fill('input[type="password"]', process.env.HOSPITABLE_PASSWORD);
  await page.waitForTimeout(500); // Small delay for form validation
  
  // Submit login form
  console.log('[INFO] Submitting login form...');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000); // Wait for response
  
  // Log current URL and page title for debugging
  const currentUrl = page.url();
  const pageTitle = await page.title();
  console.log(`[DEBUG] After login attempt - URL: ${currentUrl}`);
  console.log(`[DEBUG] After login attempt - Title: ${pageTitle}`);
  
  // Get the full page text to see what messages are displayed
  const fullPageText = await page.textContent('body');
  console.log('[DEBUG] Page content after login:');
  console.log(fullPageText.substring(0, 500)); // Log first 500 chars
  
  // Check for specific error messages
  if (fullPageText.toLowerCase().includes('incorrect') || fullPageText.toLowerCase().includes('invalid')) {
    console.log('[ERROR] Login failed - incorrect credentials detected');
    throw new Error('Incorrect email or password');
  }
  if (fullPageText.toLowerCase().includes('password') && currentUrl.includes('/user/hello')) {
    console.log('[ERROR] Still on login page - login may have failed');
  }
  
  // Wait for either Properties nav link OR device confirmation message
  try {
    await page.waitForSelector('nav >> text=Properties', { timeout: 10000 });
    console.log('[INFO] Login successful - Properties page loaded');
  } catch (e) {
    // Check if device confirmation is needed
    const pageContent = await page.textContent('body');
    
    if (pageContent.includes('device') || pageContent.includes('email') || pageContent.includes('confirm')) {
      console.log('[INFO] Device confirmation detected');
      console.log('[DEBUG] Page content contains device/email/confirm keywords');
      
        // Fetch verification link from Gmail
              const magicLink = await getVerificationLinkFromGmail(browser);
        
        if (magicLink) {
          console.log('[INFO] Found magic link from Gmail');
          console.log('[INFO] Navigating to magic link to authenticate session');
          
          // Navigate to the magic link
          await page.goto(magicLink, { waitUntil: 'networkidle' });
          console.log('[INFO] Waiting for authentication to complete...');
          await page.waitForTimeout(10000); // Wait 10 seconds for redirect
          
          // Check if we're now logged in
          const finalUrl = page.url();
          console.log(`[DEBUG] After magic link navigation - URL: ${finalUrl}`);
          console.log('[DEBUG] Checking for login success indicators...');
          
          // Wait for either dashboard or properties to appear
          try {
            await page.waitForSelector('nav >> text=Properties', { timeout: 5000 });
            console.log('[INFO] Successfully authenticated via magic link!');
          } catch (e) {
            console.log('[WARN] Properties nav link not found after magic link');
            // Check if we're at least on a logged-in page
            const bodyText = await page.textContent('body');
            if (bodyText.includes('device') || bodyText.includes('confirm') || bodyText.includes('verify')) {
              console.log('[ERROR] Still on device confirmation page - magic link may be invalid or expired');
              throw new Error('Device confirmation required - magic link did not work');
            }
          }
        } else {
          console.log('[ERROR] Could not retrieve verification link from Gmail');
          throw new Error('Device confirmation required - could not get magic link from Gmail');
        try {
        const confirmationData = JSON.parse(fs.readFileSync('confirmationLink.json', 'utf8'));
        const magicLink = confirmationData.confirmationLink;
        
        if (magicLink && magicLink.startsWith('https://my.hospitable.com/user/email-login/')) {
          console.log('[INFO] Found magic link in confirmationLink.json');
          console.log('[INFO] Navigating to magic link to authenticate session');
          
          // Navigate to the magic link
          // Navigate to the magic link
          await page.goto(magicLink, { waitUntil: 'networkidle' });
          console.log('[INFO] Waiting for authentication to complete...');
          await page.waitForTimeout(10000); // Wait 10 seconds for redirect
          
          // Check if we're now logged in
          const finalUrl = page.url();
          console.log(`[DEBUG] After magic link navigation - URL: ${finalUrl}`);
          console.log(`[DEBUG] Checking for login success indicators...`);
          
          // Wait for either dashboard or properties to appear
          try {
            await page.waitForSelector('nav >> text=Properties', { timeout: 5000 });
            console.log('[INFO] Successfully authenticated via magic link!');
          } catch (e) {
            console.log('[WARN] Properties nav link not found after magic link');
            // Check if we're at least on a logged-in page
            const bodyText = await page.textContent('body');
            if (bodyText.includes('device') || bodyText.includes('confirm') || bodyText.includes('verify')) {
              console.log('[ERROR] Still on device confirmation page - magic link may be invalid or expired');
              throw new Error('Device confirmation required - magic link did not work');
            }
         else {
          console.log('[ERROR] No valid magic link found in confirmationLink.json');
          console.log('[ERROR] Please update confirmationLink.json with the magic link from your email');
          console.log('[ERROR] Then rerun the workflow');
          throw new Error('Device confirmation required - please provide magic link in confirmationLink.json');
        }
      } catch (err) {
        console.log('[ERROR] Error reading confirmationLink.json:', err.message);
        console.log('[ERROR] Please ensure confirmationLink.json exists and contains a valid magic link');
        throw new Error('Device confirmation required - please provide magic link');
      }
    }
      
