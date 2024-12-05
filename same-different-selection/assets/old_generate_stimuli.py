from PIL import Image, ImageDraw
import math

def draw_circle(draw, center, radius, color):
    x, y = center
    draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color)

def draw_square(draw, center, size, color):
    x, y = center
    half_size = size // 2
    draw.rectangle([x - half_size, y - half_size, x + half_size, y + half_size], fill=color)

def draw_triangle(draw, center, size, color):
    x, y = center
    height = size * (3**0.5 / 2)
    top_point = (x, y - height // 2)
    left_point = (x - size // 2, y + height // 2)
    right_point = (x + size // 2, y + height // 2)
    draw.polygon([top_point, left_point, right_point], fill=color)

def draw_star(draw, center, size, color):
    x, y = center
    half_size = size // 2
    points = []
    for i in range(5):
        angle = i * (2 * 3.14159 / 5) - 3.14159 / 2
        outer_x = x + half_size * math.cos(angle)
        outer_y = y + half_size * math.sin(angle)
        points.append((outer_x, outer_y))
        
        inner_angle = angle + 3.14159 / 5
        inner_x = x + half_size * 0.5 * math.cos(inner_angle)
        inner_y = y + half_size * 0.5 * math.sin(inner_angle)
        points.append((inner_x, inner_y))
    
    draw.polygon(points, fill=color)

def draw_shape(draw, shape, center, size, color):
    if shape == 'circle':
        draw_circle(draw, center, size // 2, color)
    elif shape == 'square':
        draw_square(draw, center, size, color)
    elif shape == 'triangle':
        draw_triangle(draw, center, size, color)
    elif shape == 'star':
        draw_star(draw, center, size, color)

def save_shape(shape, size, color, cardinality, background_color):
    # Size mapping
    size_mapping = {35: 'sm', 70: 'med', 105: 'lg'}
    word_size = size_mapping[size]  # Convert size to word label
    color_mapping = {'red': '#D81B60', 'green': '#009E73', 'blue': '#1E88E5', 'yellow': '#FFC107'}  # color-blind friendly
    hex_color = color_mapping[color] # darker green: '#004D40'

    canvas_size = 220
    image = Image.new("RGB", (canvas_size, canvas_size), background_color)
    draw = ImageDraw.Draw(image)

    if cardinality in [2, 3, 4]:
        # Adjust centers to ensure no overlap
        if cardinality == 2:
            centers = [(canvas_size // 2, canvas_size // 4), (canvas_size // 2, 3 * canvas_size // 4)]
        elif cardinality == 3:
            centers = [
                (canvas_size // 2, canvas_size // 4),
                (canvas_size // 4, 3 * canvas_size // 4),
                (3 * canvas_size // 4, 3 * canvas_size // 4)
            ]
        elif cardinality == 4:
            centers = [
                (canvas_size // 4, canvas_size // 4),
                (3 * canvas_size // 4, canvas_size // 4),
                (canvas_size // 4, 3 * canvas_size // 4),
                (3 * canvas_size // 4, 3 * canvas_size // 4)
            ]
        
        for center in centers:
            draw_shape(draw, shape, center, size, hex_color)
        filename = f"{word_size}-{color}-{shape}-{cardinality}"
    else:
        center = (canvas_size // 2, canvas_size // 2)
        if shape == 'circle':
            draw_circle(draw, center, size // 2, hex_color)
        elif shape == 'square':
            draw_square(draw, center, size, hex_color)
        elif shape == 'triangle':
            draw_triangle(draw, center, size, hex_color)
        elif shape == 'star':
            draw_star(draw, center, size, hex_color)
        filename = f"{word_size}-{color}-{shape}"

    if background_color != 'white':
        filename += f"-{background_color}"
    
    filename += ".webp"
    image.save(filename, "WEBP")

shapes = ['circle', 'square', 'triangle', 'star']
sizes = [35, 70, 105]
colors = ['red', 'green', 'blue', 'yellow']
cardinalities = [1, 2, 3, 4]
background_colors = ['white', 'black', 'gray']

for shape in shapes:
    for size in sizes:
        for color in colors:
            for cardinality in cardinalities:
                for background_color in background_colors:
                    save_shape(shape, size, color, cardinality, background_color)
