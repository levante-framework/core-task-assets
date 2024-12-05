import os
import shutil
from PIL import Image



def convert_pngs_to_webps(source_dir):
    # Ensure the 'original' subdirectory exists
    original_dir = os.path.join(source_dir, 'original')
    os.makedirs(original_dir, exist_ok=True)

    # Iterate over all files in the source directory
    for filename in os.listdir(source_dir):
        if filename.endswith('.png') or filename.endswith('.jpg'):
            # Define the full path to the original PNG file
            original_path = os.path.join(source_dir, filename)
            
            # Define the full path for the new WebP file
            webp_filename = filename[:-4] + '.webp'
            webp_path = os.path.join(source_dir, webp_filename)
            
            # Convert PNG to WebP
            with Image.open(original_path) as img:
                rgb_img = img.convert('RGB')  # Ensure the image is in RGB mode
                rgb_img.save(webp_path, format='WEBP', quality=95)  # Adjust quality as needed
            
            # Move the original PNG to the 'original' subdirectory
            shutil.move(original_path, os.path.join(original_dir, filename))
    print("PNGs converted to WEBP.")


convert_pngs_to_webps('shared')