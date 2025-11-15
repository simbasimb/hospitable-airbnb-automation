require('dotenv').config();
const { chromium } = require('playwright');

const listingActions = [
  {
    propertyName: "B9",
    airbnbListingName: "B9",
    action: "unlist"
  }
];

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  async function handleError(error, stepName) {
    console.error(`[ERROR] at ${stepName}:`, error);
    await page.screenshot({ path: `error-${Date.now()}.png`, fullPage: true });
    await context.tracing.stop({ path: `trace-${Date.now()}.zip` });
    await browser.close();
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

    for (let actionItem of listingActions) {
      try {
        console.log(`\n[INFO] Processing: ${actionItem.propertyName}`);
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
            console.log(`[SUCCESS] ${actionItem.action} completed!`);
            break;
          }
        }
        
        if (!foundListing) throw new Error(`Listing not found`);
        await page.click('text="Back"');
        await page.waitForTimeout(1500);
        
      } catch (innerError) {
        await handleError(innerError, actionItem.propertyName);
      }
    }

    await context.tracing.stop({ path: `trace-success-${Date.now()}.zip` });
    await browser.close();
    console.log('\n[DONE] All actions completed!');

      // Save status to file
  const fs = require('fs');
  const statusData = {
    lastRun: new Date().toISOString(),
    status: 'Success',
    listingsProcessed: listingActions.length
  };
  fs.writeFileSync('status.json', JSON.stringify(statusData, null, 2));
    
  } catch (error) {
    await handleError(error, 'main-flow');
      const fs = require('fs');
  const statusData = {
    lastRun: new Date().toISOString(),
    status: 'Failed',
    error: error.message
  };
  fs.writeFileSync('status.json', JSON.stringify(statusData, null, 2));
  }
})();
