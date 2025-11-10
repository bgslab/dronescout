#!/bin/bash

# DroneScout V10.1 - Foursquare API Setup Guide
# This script guides you through setting up Foursquare API integration

echo "=================================================="
echo "  DroneScout - Foursquare API Setup"
echo "=================================================="
echo ""
echo "Step 1: Get Foursquare API Key"
echo "-------------------------------"
echo "1. Go to: https://location.foursquare.com/developer/"
echo "2. Click 'Get Started' or 'Sign Up'"
echo "3. Create a free account (or log in)"
echo "4. Create a new project/app"
echo "5. Copy your API key (starts with 'fsq3...')"
echo ""
echo "Free Tier Limits:"
echo "  - 100,000 API calls per month"
echo "  - Perfect for DroneScout usage"
echo ""
read -p "Press Enter when you have your API key ready..."
echo ""

echo "Step 2: Add API Key to Cloudflare Worker"
echo "------------------------------------------"
echo "Run this command to securely add your API key:"
echo ""
echo "  npx wrangler secret put FOURSQUARE_API_KEY"
echo ""
echo "When prompted, paste your Foursquare API key (fsq3...)"
echo ""
read -p "Have you run the above command? (y/n): " confirmed

if [ "$confirmed" = "y" ] || [ "$confirmed" = "Y" ]; then
    echo ""
    echo "Step 3: Deploy Worker to Cloudflare"
    echo "------------------------------------"
    echo "Deploying worker with Foursquare integration..."
    echo ""

    npx wrangler deploy cloudflare-worker.js

    if [ $? -eq 0 ]; then
        echo ""
        echo "=================================================="
        echo "  SUCCESS! Foursquare API Integration Complete"
        echo "=================================================="
        echo ""
        echo "Next Steps:"
        echo "1. Open https://bgslab.github.io/dronescout/"
        echo "2. Search for 'Crystal Lake, IL'"
        echo "3. Verify results show real places like:"
        echo "   - Crystal Lake Main Beach"
        echo "   - Veterans Acres Park"
        echo "   - Three Oaks Recreation Area"
        echo "4. Check console for: 'Found X places from Foursquare'"
        echo ""
        echo "What to expect:"
        echo "  - Real location names (not 'Viewpoint 15')"
        echo "  - Actual photos from Foursquare"
        echo "  - Urban, suburban, AND rural locations"
        echo "  - Community tips about photo spots"
        echo ""
    else
        echo ""
        echo "❌ Deployment failed. Check error above."
        echo ""
        echo "Common issues:"
        echo "  - Not logged in to Wrangler (run: npx wrangler login)"
        echo "  - API key not set (run: npx wrangler secret put FOURSQUARE_API_KEY)"
        echo ""
    fi
else
    echo ""
    echo "Please run: npx wrangler secret put FOURSQUARE_API_KEY"
    echo "Then run this script again."
fi

echo ""
