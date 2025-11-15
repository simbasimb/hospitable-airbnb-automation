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

// Check if it's weekend mode (Friday 6 PM PST to Monday 8 AM PST)
function isWeekendMode() {
  const now = new Date();
  // Convert to PST (UTC-8)
  const pstOffset = -8 * 60; // PST is UTC-8
  const pstTime = new Date(now.getTime() + (pstOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
  
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

// Determine what action to take
function getDesiredAction() {
  // If weekend mode is enabled and it's currently weekend, always list
  if (isWeekendMode()) {
    console.log('[INFO] Weekend mode active - keeping all listings published');
    return 'list';
  }
  
  // Otherwise use the ACTION from environment
  return ACTION;
}

(async () => {
  const desiredAction = getDesiredAction();
  console.log(`[INFO] Running with action: ${desiredAction}`);
  
  // Create listing actions array based on desired action
  const listingActions = PROPERTIES.map(prop => ({
    ...prop,
    action: desiredAction
  }));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  async function handleError(error, stepName) {
    console.error(`[ERROR] at ${stepName}:`, error);
    await page.screenshot({ path: `error-${Date.now()}.png`, fullPage: true });
    await context.tracing.stop({ path: `trace-${Date.now()}.zip` });
    await browser.close();
    
    const statusData = {
      lastRun: new Date().toISOString(),
      status: 'Failed',
      error: error.message,
      action: desiredAction,
      isWeekend: isWeekendMode()
    };
    fs.writeFileSync('status.json', JSON.stringify(statusData, null, 2));
    process.exit(1);
  }
  
  try {
    await context.tracing.start({ screenshots: true, snapshots: true });
    console.log('[INFO] Navigating to Hospitable...');
    await page.goto('https://my.hospitable.com/login');
    await page.waitForTimeout(2000);
    
    const alreadyLoggedIn = await page.$('nav >> text=Properties');
    if (!alreadyLoggedIn) {
      await page.fill('input[type="email"]', process.env.HOSPITABLE_EMAIL);
      await page.fill('input[type="password"]', process.env.HOSPITABLE_PASSWORD);
      await page.click('button:has-text("Sign In")');
      await page.waitForNavigation({ waitUntil: 'networkidle' });
    }
    
    await page.click('nav >> text=Properties');
    await page.waitForTimeout(2000);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (let actionItem of listingActions) {
      try {
        console.log(`\n[INFO] Processing: ${actionItem.propertyName} - Action: ${actionItem.action}`);
        await page.click(`text="${actionItem.propertyName}"`);
        await page.waitForTimeout(2000);
        
        const listings = await page.$$('div:has(> img):has(> heading)');
        let foundListing = false;
        
        for (const listing of listings) {
          const textContent = await listing.textContent();
          if (textContent.includes(actionItem.airbnbListingName) && textContent.includes('Entire Home')) {
            foundListing = true;
            const menuButton = await listing.$('button[aria-haspopup="menu"]');
            await menuButton.click();
            await page.waitForTimeout(1000);
            
            const targetAction = actionItem.action === "list" ? "List" : "Unpublish listing";
            await page.click(`text="${targetAction}"`);
            await page.waitForTimeout(1500);
            
            const modal = await page.$('[role="dialog"]');
            if (modal) {
              const firstOption = await modal.$('input[type="radio"]:not([disabled])');
              if (firstOption) await firstOption.click();
              const confirmBtn = await modal.$('button:has-text("Confirm")');
              if (confirmBtn) await confirmBtn.click();
              await page.waitForTimeout(2000);
            }
            
            console.log(`[SUCCESS] ${actionItem.action} completed for ${actionItem.propertyName}!`);
            successCount++;
            break;
          }
        }
        
        if (!foundListing) {
          console.log(`[WARNING] Listing not found for ${actionItem.propertyName}`);
          failureCount++;
        }
        
        await page.click('text="Back"');
        await page.waitForTimeout(1500);
        
      } catch (innerError) {
        console.error(`[ERROR] Failed to process ${actionItem.propertyName}:`, innerError.message);
        failureCount++;
      }
    }
    
    await context.tracing.stop({ path: `trace-success-${Date.now()}.zip` });
    await browser.close();
    console.log(`\n[DONE] All actions completed! Success: ${successCount}, Failures: ${failureCount}`);
    
    // Save status to file
    const statusData = {
      lastRun: new Date().toISOString(),
      status: failureCount === 0 ? 'Success' : 'Partial Success',
      action: desiredAction,
      isWeekend: isWeekendMode(),
      listingsProcessed: successCount,
      listingsFailed: failureCount,
      totalListings: listingActions.length
    };
    fs.writeFileSync('status.json', JSON.stringify(statusData, null, 2));
    
  } catch (error) {
    await handleError(error, 'main-flow');
  }
})();
