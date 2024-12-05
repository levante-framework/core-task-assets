#!/bin/bash

parent_folder="./problems" # Replace with your parent folder path
output_csv="output.csv"

echo "item,answer,response_alternatives" > "$output_csv"

# Function to convert filenames to camel case and remove underscores
convert_to_camel_case() {
    echo $1 | awk 'BEGIN{FS="_";OFS=""} { $1=tolower(substr($1,1,1)) substr($1,2); for (i=2; i<=NF; i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1' | tr -d '\n'
}

# Find all files and process them
find "$parent_folder" -type f | while read file; do
    dir=$(dirname "$file")
    basefile=$(basename "$file")

    # Remove file extension and convert to camel case
    filename=$(convert_to_camel_case "${basefile%.*}")

    # Initialize or clear variables for each folder
    if [[ "$prev_dir" != "$dir" ]]; then
        if [[ -n "$prev_dir" ]]; then
            # Output the previous directory's data
            response_alternatives=$(IFS=, ; echo "${alternatives[*]}")
            echo "$item,$answer,$response_alternatives" >> "$output_csv"
        fi
        item=""
        answer=""
        alternatives=()
        prev_dir="$dir"
    fi

    # Check and assign file names based on the substring they contain
    if [[ $filename == *"Stimulus"* ]]; then
        item=$filename
    elif [[ $filename == *"Answer"* ]]; then
        answer=$filename
    elif [[ $filename == *"Alternative"* ]]; then
        alternatives+=("$filename")
    fi
done

# Don't forget to output the last directory's data
if [[ -n "$prev_dir" ]]; then
    response_alternatives=$(IFS=, ; echo "${alternatives[*]}")
    echo "$item,$answer,$response_alternatives" >> "$output_csv"
fi