#!/usr/bin/env python
"""
Quick debug script to test the card scanning pipeline locally.
Run this to verify each step of the OCR process.
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from cards.views import _preprocess_and_extract_text, _get_ocr
from PIL import Image
import io

print("[DEBUG] Testing card scanning pipeline...\n")

# Step 1: Test OCR initialization
print("=" * 60)
print("STEP 1: Initialize PaddleOCR")
print("=" * 60)
try:
    ocr = _get_ocr()
    print("✅ PaddleOCR initialized successfully")
    print(f"   OCR instance: {ocr}")
except Exception as e:
    print(f"❌ Failed to initialize PaddleOCR: {e}")
    sys.exit(1)

# Step 2: Create a test image
print("\n" + "=" * 60)
print("STEP 2: Create test image")
print("=" * 60)
try:
    # Create a simple test image with text
    img = Image.new('RGB', (400, 100), color=(255, 255, 255))
    # Save it to bytes
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    test_bytes = buf.getvalue()
    print(f"✅ Created test image: {len(test_bytes)} bytes")
except Exception as e:
    print(f"❌ Failed to create test image: {e}")
    sys.exit(1)

# Step 3: Test OCR extraction (pass bytes directly — no temp file)
print("\n" + "=" * 60)
print("STEP 3: Extract text from image bytes")
print("=" * 60)
try:
    text = _preprocess_and_extract_text(test_bytes)
    if text:
        print(f"✅ OCR extracted text: '{text}'")
    else:
        print(f"⚠️  OCR found no text (expected for blank image)")
except Exception as e:
    print(f"❌ Failed during OCR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 60)
print("✅ All pipeline steps completed successfully!")
print("=" * 60)
print("\nNext: Try uploading a real MTG card image to the /api/cards/scan/ endpoint")
