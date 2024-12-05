import csv

# Parameters for the trial generation
objects = ['a', 'b', 'c', 'd', 'e']
chiralities = ['n', 'p']
sm_numbers = list(range(1, 71))  # SM numbers 1 to 70
# we only have: 
# a - 1,2,6,10,11,13,17
# b - 1,5,6,8,12,14,15
# c - 3,5,6,10,14,15,17
# d - 1,2,4,8,10,11,15
# e - 
angles = [0, 40, 80, 120, 160, 200, 240, 280, 320]

# Function to create the filename
def create_filename(obj, chiral, number, angle):
    return f"{obj}{chiral}-{str(number).zfill(2)}-{str(angle).zfill(3)}.jpg"

# Function to generate all possible trials
def generate_trials():
    trials = []
    for obj in objects:
        for number in sm_numbers:
            for angle1 in angles:
                # Creating a matching image (same object and chirality)
                image1 = create_filename(obj, 'n', number, angle1)

                for angle2 in angles:
                    # Matching rotation trial
                    if angle1 != angle2:
                        image2 = create_filename(obj, 'n', number, angle2)
                        trials.append([image1, image2, True, abs(angle1 - angle2)])
                    
                    # Distractor trial with opposite chirality
                    distractor_image = create_filename(obj, 'p', number, angle2)
                    trials.append([image1, distractor_image, False, 0])

    return trials

# Generating the trials
all_trials = generate_trials()

# Writing to a CSV file
with open('shepard_metzler_trials.csv', mode='w', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['object1_filename', 'object2_filename', 'is_rotation', 'degrees_rotation'])
    writer.writerows(all_trials)