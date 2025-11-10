#!/bin/bash

# Helper script to add Google Places API key to DroneScout
# Usage: ./add_google_key.sh

echo "🗺️  DroneScout - Add Google Places API Key"
echo "=========================================="
echo ""
echo "This script will add your Google Places API key to index.html"
echo ""
read -p "Enter your Google Places API Key: " API_KEY

if [ -z "$API_KEY" ]; then
    echo "❌ Error: No API key provided"
    exit 1
fi

# Backup original file
cp index.html index.html.backup

# Replace the placeholder with actual key
sed -i.tmp "s/YOUR_GOOGLE_PLACES_API_KEY_HERE/$API_KEY/" index.html && rm index.html.tmp

echo ""
echo "✅ API key added successfully!"
echo "📄 Backup saved to: index.html.backup"
echo ""
echo "Next steps:"
echo "1. Test locally by opening index.html in your browser"
echo "2. Check Settings tab for green '✅ Google Places API Enabled'"
echo "3. Try searching 'Crystal Lake, IL'"
echo ""
echo "If it works, commit and push:"
echo "  git add index.html"
echo "  git commit -m 'Add Google Places API key'"
echo "  git push"
echo ""
