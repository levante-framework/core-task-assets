import os
import csv
from pydub import AudioSegment

def convert_wav_to_mp3(directory, csv_file):
    # Read the CSV file and create a mapping of input to output filenames
    file_mappings = {}
    with open(csv_file, mode='r') as file:
        reader = csv.DictReader(file)
        for row in reader:
            file_mappings[row['input']] = row['output']
    
    for input_filename, output_filename in file_mappings.items():
        # Construct the full input file path
        wav_path = os.path.join(directory, input_filename.upper() + '.wav')
        # Check if the input WAV file exists
        if not os.path.exists(wav_path):
            print(f"File {wav_path} does not exist. Skipping.")
            continue
        
        # Load the WAV file
        audio = AudioSegment.from_wav(wav_path)
        # Construct the full output file path
        mp3_path = os.path.join(directory, output_filename + '.mp3')
        # Export the audio as MP3
        audio.export(mp3_path, format="mp3")
        print(f"Converted {input_filename} to {output_filename}")


csv_file = 'filenames.csv'
audio_dir = 'en'
convert_wav_to_mp3(audio_dir, csv_file)