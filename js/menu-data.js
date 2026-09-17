/**
 * Stanley's SW16 - Streatham Official Food Menu Data
 * Sourced from https://www.stanleyssw16.com/food
 * Includes Main Food Menu, Sunday Roasts, Prices in GBP, Allergens & Dietary Tags.
 */

window.STANLEYS_MENU_DATA = {
    info: {
        restaurantName: "Stanley's SW16",
        location: "Streatham, London (SW16)",
        website: "https://www.stanleyssw16.com/food",
        pdfUrl: "https://www.stanleyssw16.com/_files/ugd/8d1c70_f463c172c4b8499d9ce11a2e1f785546.pdf",
        sundayHours: "Domingos: 12:00 PM – 8:00 PM",
        sundayDescription_es: "Todos los roasts incluyen patatas asadas al ajo, zanahorias asadas, puerros a la crema, repollo hispi, Yorkshire pudding casero y gravy caliente.",
        sundayDescription_en: "All roasts served with garlic roasties, thyme roasted carrots, creamed leeks, hispi cabbage, homemade Yorkshire pudding & gravy."
    },
    sections: [
        {
            id: 'main',
            name_es: 'Menú Principal',
            name_en: 'Main Menu',
            icon: 'restaurant',
            categories: [
                {
                    id: 'finger_food',
                    name_es: 'Finger Food & Entrantes',
                    name_en: 'Finger Food & Starters',
                    icon: 'tapas',
                    items: [
                        {
                            id: 'ff_1',
                            name: 'Nashville Fried Chicken',
                            price: 12.00,
                            desc_es: 'Pollo frito estilo Nashville crujiente con suero de leche y cayena, pepinillos encurtidos y salsa ranch.',
                            desc_en: 'Crispy buttermilk & cayenne Nashville-style fried chicken, house pickles, and ranch sauce.',
                            tags: ['hot', 'chicken'],
                            allergens: ['gluten', 'eggs', 'milk', 'mustard']
                        },
                        {
                            id: 'ff_2',
                            name: 'Sharing Nachos',
                            price: 14.00,
                            priceOptions: '£14 (Chilli con carne +£4)',
                            desc_es: 'Nachos para compartir con salsa de queso, guacamole, crema agria, salsa fresca y jalapeños (V). Opción con Chilli con Carne (+£4).',
                            desc_en: 'Tortilla chips with cheese sauce, guac, sour cream, fresh salsa and jalapeños (V). Add Chilli con Carne +£4.',
                            tags: ['V', 'sharing'],
                            allergens: ['milk']
                        },
                        {
                            id: 'ff_3',
                            name: 'BBQ Ribs',
                            price: 12.00,
                            desc_es: 'Costillitas de cerdo melosas con salsa barbacoa de la casa, cebolleta y semillas de sésamo.',
                            desc_en: 'Sticky pork ribs tossed in house BBQ sauce, spring onions and sesame.',
                            tags: ['pork'],
                            allergens: ['sesame', 'soya', 'mustard']
                        },
                        {
                            id: 'ff_4',
                            name: 'Chicken Wings',
                            price: 9.00,
                            desc_es: 'Alitas de pollo glaseadas en salsa Buffalo con dip de queso azul o salsa BBQ dulce.',
                            desc_en: 'Chicken wings tossed in spicy Buffalo with blue cheese dip, or sweet sticky BBQ.',
                            tags: ['chicken'],
                            allergens: ['milk', 'celery']
                        },
                        {
                            id: 'ff_padron',
                            name: 'Padrón Peppers',
                            price: 8.00,
                            desc_es: 'Pimientos de Padrón fritos con vinagreta de jerez y sal marina en escamas.',
                            desc_en: 'Blistered Padrón peppers with sherry vinaigrette & Maldon sea salt.',
                            tags: ['VE', 'tapas'],
                            allergens: ['sulphites']
                        },
                        {
                            id: 'ff_gyoza',
                            name: 'Gyoza (Langostino o Veggie)',
                            price: 8.00,
                            desc_es: 'Empanadillas japonesas a elegir: rellenas de langostino o vegetales (VEO) con salsa de soja y sésamo.',
                            desc_en: 'Pan-fried Japanese dumplings: choice of prawn or veggie (VEO) with soy dipping sauce.',
                            tags: ['VEO', 'asian'],
                            allergens: ['gluten', 'crustaceans', 'soya', 'sesame']
                        },
                        {
                            id: 'ff_5',
                            name: 'Vegan "Chick\'n" Tenders',
                            price: 9.00,
                            desc_es: 'Tiras 100% vegetales crujientes con mayonesa suave de sriracha.',
                            desc_en: 'Crispy plant-based tenders served with spicy sriracha mayo.',
                            tags: ['VE'],
                            allergens: ['gluten', 'soya', 'mustard']
                        },
                        {
                            id: 'ff_6',
                            name: 'Calamari & Courgette Fritti',
                            price: 9.00,
                            desc_es: 'Calamares y calabacín crujientes con limón fresco y alioli.',
                            desc_en: 'Crisp calamari & courgette fritti with fresh lemon & garlic aioli.',
                            tags: ['seafood'],
                            allergens: ['molluscs', 'gluten', 'eggs']
                        },
                        {
                            id: 'ff_7',
                            name: 'Mozzarella Sticks',
                            price: 8.00,
                            desc_es: 'Bastones de mozzarella crujientes con salsa de tomate picante.',
                            desc_en: 'Golden breaded mozzarella sticks with spicy tomato dipping sauce.',
                            tags: ['V'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'ff_8',
                            name: 'Garlic Bread / With Cheese',
                            price: 6.00,
                            priceOptions: '£6 / £8 con queso',
                            desc_es: 'Pan tostado con mantequilla de ajo y hierbas. Con mozzarella gratinada £8.',
                            desc_en: 'Toasted sourdough with garlic butter. With melted mozzarella £8.',
                            tags: ['V'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'ff_9',
                            name: 'Baked Camembert',
                            price: 14.00,
                            desc_es: 'Queso Camembert entero horneado con romero fresco y ajo, mermelada de cebolla morada y pan masa madre tostado.',
                            desc_en: 'Warm baked Camembert with fresh rosemary & garlic, red onion marmalade and toasted sourdough.',
                            tags: ['V', 'sharing'],
                            allergens: ['milk', 'gluten']
                        }
                    ]
                },
                {
                    id: 'mains',
                    name_es: 'Platos Principales',
                    name_en: 'Mains',
                    icon: 'dinner_dining',
                    items: [
                        {
                            id: 'main_1',
                            name: 'Full Rack / Half Rack BBQ Ribs',
                            price: 24.00,
                            priceOptions: '£24 Full / £15 Half',
                            desc_es: 'Costillar entero o medio costillar de cerdo glaseado en barbacoa lenta, servido con patatas fritas y ensalada coleslaw.',
                            desc_en: 'Slow-cooked whole or half rack of pork ribs in rich BBQ glaze, served with skin-on fries and house slaw.',
                            tags: ['pork', 'classic'],
                            allergens: ['soya', 'mustard', 'eggs']
                        },
                        {
                            id: 'main_2',
                            name: '300gr 28 Day Aged Sirloin',
                            price: 24.00,
                            desc_es: 'Entrecot de ternera madurado 28 días (300g), patatas fritas, tomate asado, champiñón a la parrilla y salsa pimienta verde.',
                            desc_en: '28-day aged British sirloin steak (300g), skin-on fries, roasted tomato, portobello mushroom and peppercorn sauce.',
                            tags: ['beef', 'premium'],
                            allergens: ['milk', 'gluten', 'celery']
                        },
                        {
                            id: 'main_3',
                            name: 'Cod & Chips',
                            price: 23.00,
                            desc_es: 'Lomo de bacalao rebozado crujiente en masa de cerveza, puré de guisantes (mushy peas), salsa tártara y limón.',
                            desc_en: 'Fresh beer-battered Atlantic cod, thick cut chips, crushed mushy peas, homemade tartare and fresh lemon.',
                            tags: ['fish', 'british_classic'],
                            allergens: ['fish', 'gluten', 'eggs']
                        },
                        {
                            id: 'main_4',
                            name: 'Beefsteak Suet Pudding',
                            price: 18.00,
                            desc_es: 'Pudin tradicional británico de masa de sebo relleno de ternera estofada, puré de patatas cremoso, verduras de temporada y jugo de carne.',
                            desc_en: 'Traditional steamed suet pudding stuffed with tender braised beef steak, creamy mash, seasonal greens and rich gravy.',
                            tags: ['beef', 'comfort_food'],
                            allergens: ['gluten', 'milk', 'celery']
                        },
                        {
                            id: 'main_5',
                            name: '1/2 Chicken & Chips',
                            price: 17.00,
                            desc_es: 'Medio pollo asado a elegir: estilo Limón & Hierbas o Peri Peri picante, servido con patatas fritas y ensalada coleslaw.',
                            desc_en: 'Half roast chicken marinated in Lemon & Herb or Spicy Peri Peri, served with fries and crunchy house coleslaw.',
                            tags: ['chicken'],
                            allergens: ['mustard', 'eggs']
                        },
                        {
                            id: 'main_6',
                            name: 'Cheese Burger & Chips',
                            price: 16.00,
                            priceOptions: '£16 (Bacon +£2.50)',
                            desc_es: 'Hamburguesa 100% vacuno británico (6oz), salsa especial de la casa, lechuga crujiente, tomate, pepinillos y queso fundido.',
                            desc_en: '6oz British prime beef patty, secret burger sauce, crisp lettuce, tomato, pickles and melted Monterey Jack. Add smoked bacon +£2.50.',
                            tags: ['beef', 'burger'],
                            allergens: ['gluten', 'milk', 'eggs', 'mustard', 'sesame']
                        },
                        {
                            id: 'main_7',
                            name: 'Buffalo Chicken Burger & Chips',
                            price: 16.00,
                            desc_es: 'Pechuga de pollo frito crujiente bañada en salsa Buffalo picante, aderezo cremoso de queso azul, lechuga y pepinillos.',
                            desc_en: 'Crispy fried chicken breast drenched in spicy Buffalo glaze, creamy blue cheese dressing, lettuce and pickles in a brioche bun.',
                            tags: ['chicken', 'burger', 'hot'],
                            allergens: ['gluten', 'milk', 'eggs']
                        },
                        {
                            id: 'main_risotto',
                            name: 'Courgette Risotto',
                            price: 16.00,
                            desc_es: 'Cremoso risotto de calabacín con pesto fresco de albahaca y lascas de queso parmesano.',
                            desc_en: 'Creamy courgette risotto with fresh basil pesto and aged parmesan shavings.',
                            tags: ['V', 'risotto'],
                            allergens: ['milk']
                        }
                    ]
                },
                {
                    id: 'essentials',
                    name_es: 'Clásicos del Pub (SOS Essentials £14)',
                    name_en: 'Pub Essentials (£14)',
                    icon: 'local_dining',
                    notice_es: 'Platos clásicos del pub a £14.',
                    notice_en: 'All classic pub essentials £14.',
                    items: [
                        {
                            id: 'ess_1',
                            name: 'Pie of the Day',
                            price: 14.00,
                            desc_es: 'Pastel artesanal del día con hojaldre dorado, puré o patatas y verduras a la mantequilla con salsa gravy.',
                            desc_en: 'Chef’s freshly baked pie in golden crust with buttered greens, mash or chips and gravy.',
                            tags: ['pie', 'classic'],
                            allergens: ['gluten', 'milk', 'celery']
                        },
                        {
                            id: 'ess_2',
                            name: 'Bangers & Mash',
                            price: 14.00,
                            desc_es: 'Salchichas Cumberland tradicionales, puré cremoso de patata y gravy espeso de cebolla.',
                            desc_en: 'Cumberland sausages, creamy mashed potatoes and rich onion gravy.',
                            tags: ['pork', 'classic'],
                            allergens: ['gluten', 'milk', 'sulphites']
                        },
                        {
                            id: 'ess_gammon',
                            name: 'Gammon, 2 Egg & Chips',
                            price: 14.00,
                            desc_es: 'Filete grueso de jamón curado (gammon) a la plancha con dos huevos fritos de campo, patatas fritas y berros.',
                            desc_en: 'Traditional thick-cut gammon steak, two fried free-range eggs, chips and fresh watercress garnish.',
                            tags: ['pork', 'british_classic', 'bestseller'],
                            allergens: ['eggs']
                        },
                        {
                            id: 'ess_3',
                            name: 'Veggie Bangers & Mash',
                            price: 14.00,
                            desc_es: 'Salchichas vegetales a las finas hierbas, puré cremoso de patata y gravy vegetal de cebolla.',
                            desc_en: 'Plant-based herb sausages, smooth creamy mash and caramelised onion vegetarian gravy.',
                            tags: ['V'],
                            allergens: ['soya', 'milk']
                        },
                        {
                            id: 'ess_veggie_burger',
                            name: 'Veggie Cheese Burger & Chips',
                            price: 14.00,
                            desc_es: 'Hamburguesa 100% vegetal con queso Cheddar fundido (VEO) y patatas fritas.',
                            desc_en: 'Plant-based burger patty, melted Cheddar (VEO) and skin-on chips.',
                            tags: ['V', 'VEO', 'burger'],
                            allergens: ['gluten', 'milk', 'soya']
                        },
                        {
                            id: 'ess_4',
                            name: 'Fish Finger Sandwich & Chips',
                            price: 14.00,
                            desc_es: 'Palitos gruesos de bacalao rebozado, salsa tártara casera en pan brioche con patatas.',
                            desc_en: 'Crispy thick-cut battered fish fingers, house tartare sauce in toasted brioche with fries.',
                            tags: ['fish'],
                            allergens: ['fish', 'gluten', 'eggs', 'milk']
                        }
                    ]
                },
                {
                    id: 'sandwiches',
                    name_es: 'Sandwiches de Masa Madre (£6.50)',
                    name_en: 'Sourdough Sandwiches (£6.50)',
                    icon: 'bakery_dining',
                    notice_es: 'Disponibles de Lunes a Viernes de 12:00 a 16:00 en pan de masa madre.',
                    notice_en: 'Available Monday to Friday, 12pm – 4pm only on fresh sourdough.',
                    items: [
                        {
                            id: 'sw_1',
                            name: 'Ham Salad Sandwich',
                            price: 6.50,
                            desc_es: 'Jamón cocido de calidad, ensalada crujiente y mostaza suave en pan de masa madre.',
                            desc_en: 'Sliced Wiltshire ham, fresh crisp salad leaves and mild mustard on sourdough.',
                            tags: ['sandwich', 'lunch'],
                            allergens: ['gluten', 'mustard']
                        },
                        {
                            id: 'sw_2',
                            name: 'Cheddar Cheese Ploughman’s',
                            price: 6.50,
                            desc_es: 'Queso Cheddar curado inglés, pepinillos encurtidos y chutney tradicional en pan de masa madre.',
                            desc_en: 'Mature British Cheddar, tangy pickle chutney and salad on crusty sourdough.',
                            tags: ['V', 'sandwich', 'lunch'],
                            allergens: ['gluten', 'milk', 'sulphites']
                        },
                        {
                            id: 'sw_3',
                            name: 'Roast Beef & Horseradish',
                            price: 6.50,
                            desc_es: 'Finas láminas de ternera asada (roast beef), crema de rábano picante (horseradish) y rúcula.',
                            desc_en: 'Thinly sliced tender roast beef, creamed horseradish sauce and fresh rocket.',
                            tags: ['beef', 'sandwich', 'lunch'],
                            allergens: ['gluten', 'milk', 'eggs']
                        },
                        {
                            id: 'sw_4',
                            name: 'Tomato, Salad & Pesto',
                            price: 6.50,
                            desc_es: 'Tomates maduros de huerto, hojas tiernas y pesto verde de albahaca en pan de masa madre.',
                            desc_en: 'Vine-ripened tomatoes, crisp leaves and fragrant basil pesto on sourdough.',
                            tags: ['VE', 'sandwich', 'lunch'],
                            allergens: ['gluten']
                        }
                    ]
                },
                {
                    id: 'pizza',
                    name_es: 'Pizzas al Horno de Leña',
                    name_en: 'Wood Fired Sourdough Pizza',
                    icon: 'local_pizza',
                    notice_es: 'Masa madre artesanal fermentada 48h. Base sin gluten disponible (+£4). Queso vegano disponible.',
                    notice_en: 'Handmade 48h fermented sourdough. Gluten-free base available (+£4). Vegan cheese available.',
                    items: [
                        {
                            id: 'pz_1',
                            name: 'Margherita',
                            price: 11.00,
                            desc_es: 'Salsa de tomate San Marzano, mozzarella Fior di Latte, albahaca fresca y aceite de oliva virgen.',
                            desc_en: 'San Marzano tomato base, Fior di Latte mozzarella, fresh basil and extra virgin olive oil.',
                            tags: ['V'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'pz_2',
                            name: 'Aubergine Parm',
                            price: 15.00,
                            desc_es: 'Berenjena asada al horno, parmesano, mozzarella Fior di Latte y aceite aromatizado de albahaca.',
                            desc_en: 'Roasted seasoned aubergine, shaved parmesan, Fior di Latte mozzarella and fragrant basil oil.',
                            tags: ['V', 'VE*'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'pz_3',
                            name: 'Truffle Pig',
                            price: 14.00,
                            desc_es: 'Prosciutto cotto italiano, champiñones salteados, mozzarella y aceite de trufa blanca.',
                            desc_en: 'Italian prosciutto cotto ham, sautéed mushrooms, creamy mozzarella and aromatic truffle oil.',
                            tags: ['pork', 'pizza'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'pz_4',
                            name: 'Weirough',
                            price: 15.50,
                            desc_es: 'Nduja calabresa picante, queso Gorgonzola cremoso, mozzarella y un toque de miel silvestre.',
                            desc_en: 'Spicy soft nduja sausage, tangy Gorgonzola cheese, Fior di Latte mozzarella and wild honey drizzle.',
                            tags: ['hot', 'pork'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'pz_5',
                            name: 'Allotment',
                            price: 14.00,
                            desc_es: 'Pimientos dulces asados, calabacín a la parrilla, cebolla roja, aceitunas negras y mozzarella vegana opcional.',
                            desc_en: 'Roasted sweet peppers, grilled courgettes, red onions, black kalamata olives and vegan mozzarella.',
                            tags: ['V', 'VE', 'VE*'],
                            allergens: ['gluten']
                        },
                        {
                            id: 'pz_6',
                            name: 'American Hot',
                            price: 15.50,
                            desc_es: 'Pepperoni picante prémium, rodajas de jalapeño encurtido, chile rojo fresco y mozzarella.',
                            desc_en: 'Double spicy pepperoni, pickled jalapeños, fresh red chillies and rich mozzarella.',
                            tags: ['hot', 'pork'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'pz_7',
                            name: 'Hot Honey Pepperoni',
                            price: 14.50,
                            desc_es: 'Pepperoni crujiente con rocío de miel picante Hot Honey y copos de guindilla.',
                            desc_en: 'Crispy cup pepperoni drizzled with artisanal hot chilli honey and crushed pepper flakes.',
                            tags: ['hot', 'pork', 'bestseller'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'pz_8',
                            name: 'Any 3 Toppings (Custom)',
                            price: 15.50,
                            desc_es: 'Crea tu propia pizza con base de tomate y queso + 3 ingredientes a tu elección.',
                            desc_en: 'Craft your bespoke sourdough pizza: base sauce & cheese + any 3 ingredients.',
                            tags: ['custom'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'pz_9',
                            name: 'Crust Dips',
                            price: 2.00,
                            desc_es: 'Salsas para los bordes: Mayonesa de ajo, Sriracha picante, Mayonesa de trufa o BBQ ahumada.',
                            desc_en: 'Artisan dips for the crusts: Garlic mayo, Spicy sriracha mayo, Truffle mayo, Smoky BBQ.',
                            tags: ['dip'],
                            allergens: ['eggs', 'mustard']
                        }
                    ]
                },
                {
                    id: 'sides',
                    name_es: 'Guarniciones & Extras',
                    name_en: 'Sides',
                    icon: 'lunch_dining',
                    items: [
                        {
                            id: 'sd_1',
                            name: 'Chips / Fries',
                            price: 5.00,
                            desc_es: 'Patatas fritas crujientes con sal marina.',
                            desc_en: 'Crispy skin-on potato fries with sea salt.',
                            tags: ['VE', 'GF*'],
                            allergens: []
                        },
                        {
                            id: 'sd_2',
                            name: 'Sweet Potato Fries',
                            price: 5.00,
                            desc_es: 'Boniato / Batata frita crujiente con sal de hierbas.',
                            desc_en: 'Golden crispy sweet potato fries.',
                            tags: ['VE', 'GF*'],
                            allergens: []
                        },
                        {
                            id: 'sd_3',
                            name: 'Creamy Mash',
                            price: 5.00,
                            desc_es: 'Puré de patatas aterciopelado con mantequilla inglesa.',
                            desc_en: 'Velvety smooth mash made with English butter and cream.',
                            tags: ['V'],
                            allergens: ['milk']
                        },
                        {
                            id: 'sd_4',
                            name: 'Buttered Seasonal Greens',
                            price: 5.00,
                            desc_es: 'Verduras verdes de temporada salteadas a la mantequilla.',
                            desc_en: 'Steamed seasonal greens tossed in melted garlic butter.',
                            tags: ['V'],
                            allergens: ['milk']
                        },
                        {
                            id: 'sd_5',
                            name: 'Mixed Leaf Salad',
                            price: 5.00,
                            desc_es: 'Hojas verdes frescas con vinagreta de la casa.',
                            desc_en: 'Crisp mixed salad leaves with house dressing.',
                            tags: ['VE'],
                            allergens: ['mustard']
                        },
                        {
                            id: 'sd_6',
                            name: 'Tomato & Red Onion Salad',
                            price: 5.00,
                            desc_es: 'Tomates maduros, cebolla morada fina y vinagreta balsámica.',
                            desc_en: 'Ripe vine tomatoes, thinly sliced red onion and balsamic dressing.',
                            tags: ['VE'],
                            allergens: []
                        }
                    ]
                },
                {
                    id: 'kids',
                    name_es: 'Menú Infantil',
                    name_en: 'Kids Menu',
                    icon: 'child_care',
                    notice_es: 'Todos los platos infantiles a £8.50 cada uno.',
                    notice_en: 'All children’s meals £8.50 each.',
                    items: [
                        {
                            id: 'kd_1',
                            name: 'Crispy Chicken Goujons',
                            price: 8.50,
                            desc_es: 'Tiras tiernas de pollo rebozado casero con patatas fritas.',
                            desc_en: 'Tender crumbed chicken goujons served with chips.',
                            tags: ['kids', 'chicken'],
                            allergens: ['gluten', 'eggs']
                        },
                        {
                            id: 'kd_2',
                            name: 'Kids Ham & Mozzarella Pizza',
                            price: 8.50,
                            desc_es: 'Pizza infantil de masa madre con jamón cocido y mozzarella suave.',
                            desc_en: 'Small sourdough pizza topped with cooked ham and mild mozzarella.',
                            tags: ['kids', 'pizza'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'kd_3',
                            name: 'Kids Margherita Pizza',
                            price: 8.50,
                            desc_es: 'Pizza clásica infantil con salsa de tomate suave y queso mozzarella.',
                            desc_en: 'Classic small pizza with tomato sauce and melted cheese.',
                            tags: ['kids', 'V', 'pizza'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'kd_4',
                            name: 'Kids Bangers & Mash',
                            price: 8.50,
                            desc_es: 'Salchicha británica con puré de patatas suave y salsa gravy.',
                            desc_en: 'Pork sausage with creamy mash potato and light gravy.',
                            tags: ['kids'],
                            allergens: ['gluten', 'milk']
                        }
                    ]
                },
                {
                    id: 'desserts',
                    name_es: 'Postres Artesanales',
                    name_en: 'Desserts',
                    icon: 'icecream',
                    items: [
                        {
                            id: 'ds_1',
                            name: 'Brioche & Butter Pudding',
                            price: 8.00,
                            desc_es: 'Pudin tradicional horneado con pan brioche y mantequilla, pasas y crema inglesa templada (custard).',
                            desc_en: 'Classic warm brioche bread & butter pudding served with rich hot vanilla custard.',
                            tags: ['V', 'dessert'],
                            allergens: ['gluten', 'milk', 'eggs']
                        },
                        {
                            id: 'ds_2',
                            name: 'Sticky Toffee Pudding',
                            price: 7.50,
                            desc_es: 'Esponjoso bizcocho de dátiles bañado en salsa toffee caliente de caramelo, servido con helado de vainilla de Madagascar.',
                            desc_en: 'Warm date sponge drenched in rich sticky toffee sauce, served with artisan vanilla pod ice cream.',
                            tags: ['V', 'dessert', 'bestseller'],
                            allergens: ['gluten', 'milk', 'eggs']
                        },
                        {
                            id: 'ds_biscoff',
                            name: 'Biscoff Cheesecake',
                            price: 7.00,
                            desc_es: 'Tarta de queso cremosa con galleta Lotus Biscoff y helado de vainilla.',
                            desc_en: 'Creamy Lotus Biscoff cheesecake served with artisan vanilla ice cream.',
                            tags: ['V', 'dessert'],
                            allergens: ['gluten', 'milk', 'soya']
                        },
                        {
                            id: 'ds_crumble',
                            name: 'Spicy Apple Crumble',
                            price: 8.00,
                            desc_es: 'Crumble crujiente de manzana especiada con canela, helado de vainilla y crema inglesa caliente.',
                            desc_en: 'Warm spiced Bramley apple crumble served with vanilla ice cream & hot custard.',
                            tags: ['V', 'dessert'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'ds_3',
                            name: 'Sorbets & Ice Creams',
                            price: 2.00,
                            priceOptions: '£2.00 / bola',
                            desc_es: 'Selección de helados y sorbetes artesanos: Vainilla, Chocolate belga, Fresa, Sorbete de frambuesa o Limón.',
                            desc_en: 'Artisan scoops: Vanilla, Belgian chocolate, Strawberry, Lemon or Raspberry sorbet.',
                            tags: ['V', 'VE', 'icecream'],
                            allergens: ['milk']
                        }
                    ]
                }
            ]
        },
        {
            id: 'sunday',
            name_es: 'SOS Sunday Roasts',
            name_en: 'Sunday Roasts',
            icon: 'outdoor_grill',
            badge: '12:00 – 20:00',
            categories: [
                {
                    id: 'sunday_roasts',
                    name_es: 'Los Asados de Domingo (The Roasts)',
                    name_en: 'The Roasts',
                    icon: 'kebab_dining',
                    notice_es: 'Todos los roasts se acompañan de patatas asadas al ajo, zanahorias asadas al tomillo, puerros a la crema, repollo hispi, Yorkshire pudding casero y salsa gravy caliente.',
                    notice_en: 'All served with garlic roasties, thyme roasted carrots, creamed leeks, hispi cabbage, homemade Yorkshire pudding & rich gravy.',
                    items: [
                        {
                            id: 'sun_1',
                            name: '28 Day Aged Beef Topside',
                            price: 23.00,
                            desc_es: 'Ternera británica madurada 28 días servida en su punto medio-rosado, con rábano picante (horseradish).',
                            desc_en: '28 day dry aged British beef topside served tender medium-rare with fresh creamed horseradish.',
                            tags: ['beef', 'roast', 'bestseller'],
                            allergens: ['gluten', 'milk', 'eggs', 'celery']
                        },
                        {
                            id: 'sun_2',
                            name: 'Roast Leg of Lamb',
                            price: 23.00,
                            desc_es: 'Pierna de cordero asada lentamente con romero y ajo, acompañada de salsa tradicional de menta inglesa.',
                            desc_en: 'Slow-roasted succulent leg of lamb with garlic & rosemary rub, served with sweet mint sauce.',
                            tags: ['lamb', 'roast'],
                            allergens: ['gluten', 'milk', 'eggs', 'celery']
                        },
                        {
                            id: 'sun_3',
                            name: 'Corn Fed Half Roast Chicken',
                            price: 20.00,
                            desc_es: 'Medio pollo campero alimentado con maíz asado al punto, servido con salsa de pan (bread sauce) y relleno.',
                            desc_en: 'Succulent grain-fed half roast chicken served with traditional bread sauce and herb stuffing.',
                            tags: ['chicken', 'roast'],
                            allergens: ['gluten', 'milk', 'eggs', 'celery']
                        },
                        {
                            id: 'sun_4',
                            name: 'Old Spot Belly of Pork',
                            price: 20.00,
                            desc_es: 'Panceta de cerdo de raza Old Spot con corteza súper crujiente (crackling) y salsa compota de manzana.',
                            desc_en: 'Slow-braised British Old Spot pork belly with super crisp crackling and spiced Bramley apple sauce.',
                            tags: ['pork', 'roast'],
                            allergens: ['gluten', 'milk', 'eggs', 'celery']
                        },
                        {
                            id: 'sun_5',
                            name: 'Homemade Veggie Wellington',
                            price: 19.00,
                            desc_es: 'Wellington vegetal artesanal envuelto en hojaldre crujiente con setas silvestres, espinacas tiernas, lentejas y gravy vegetal.',
                            desc_en: 'Artisan mushroom, spinach & lentil Wellington wrapped in crisp golden puff pastry with vegetable red wine gravy.',
                            tags: ['V', 'roast'],
                            allergens: ['gluten', 'milk', 'eggs', 'celery']
                        }
                    ]
                },
                {
                    id: 'sunday_sides',
                    name_es: 'Extras & Acompañamientos de Domingo',
                    name_en: 'Sunday Sides & Extras',
                    icon: 'add_circle',
                    items: [
                        {
                            id: 'sun_sd_1',
                            name: 'Cauliflower Cheese',
                            price: 6.00,
                            desc_es: 'Coliflor horneada con bechamel extra de queso Cheddar curado gratinado.',
                            desc_en: 'Oven-baked tender cauliflower florets in rich mature Cheddar cheese sauce.',
                            tags: ['V'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'sun_sd_2',
                            name: 'Pigs in Blankets',
                            price: 6.00,
                            desc_es: 'Salchichitas de cerdo envueltas en panceta ahumada crujiente con glaseado de miel y mostaza.',
                            desc_en: 'Cocktail sausages wrapped in streaky smoked bacon with honey mustard glaze.',
                            tags: ['pork'],
                            allergens: ['gluten', 'mustard']
                        },
                        {
                            id: 'sun_sd_3',
                            name: 'Extra Roast Potatoes',
                            price: 4.00,
                            desc_es: 'Ración adicional de patatas asadas con ajo y romero supercrujientes.',
                            desc_en: 'Extra portion of crispy garlic & rosemary roasties.',
                            tags: ['VE', 'GF*'],
                            allergens: []
                        },
                        {
                            id: 'sun_sd_4',
                            name: 'Extra Yorkshire Pudding',
                            price: 1.50,
                            desc_es: 'Pudin de Yorkshire gigante recién horneado.',
                            desc_en: 'Giant fluffy freshly baked Yorkshire pudding.',
                            tags: ['V'],
                            allergens: ['gluten', 'milk', 'eggs']
                        },
                        {
                            id: 'sun_sd_5',
                            name: 'Extra Gravy Boat',
                            price: 2.00,
                            desc_es: 'Salsera extra de gravy caliente de vino tinto y ternera o vegetal.',
                            desc_en: 'Extra jug of steaming hot red wine meat or vegetable gravy.',
                            tags: ['gravy'],
                            allergens: ['gluten', 'celery']
                        }
                    ]
                },
                {
                    id: 'sunday_desserts',
                    name_es: 'Postres de Domingo',
                    name_en: 'Sunday Desserts',
                    icon: 'cake',
                    items: [
                        {
                            id: 'sun_ds_1',
                            name: 'Traditional Eton Mess',
                            price: 8.00,
                            desc_es: 'Merengue crujiente desmenuzado con frutos rojos, salsa de frambuesas y nata montada fresca.',
                            desc_en: 'Crumbled crisp meringue, macerated summer berries, raspberry coulis and fresh whipped cream.',
                            tags: ['V', 'dessert'],
                            allergens: ['milk', 'eggs']
                        },
                        {
                            id: 'sun_ds_2',
                            name: 'Apple & Blackberry Crumble',
                            price: 7.50,
                            desc_es: 'Crumble crujiente de manzana asada y moras silvestres servido con crema inglesa caliente o helado.',
                            desc_en: 'Baked Bramley apple & blackberry compote with oat crumble topping and hot custard.',
                            tags: ['V', 'dessert'],
                            allergens: ['gluten', 'milk']
                        },
                        {
                            id: 'sun_ds_3',
                            name: 'Sticky Toffee Pudding',
                            price: 7.50,
                            desc_es: 'Clásico pudin caliente de toffee con helado de vainilla.',
                            desc_en: 'Classic hot date sponge with toffee drizzle and vanilla ice cream.',
                            tags: ['V', 'dessert'],
                            allergens: ['gluten', 'milk', 'eggs']
                        }
                    ]
                },
                {
                    id: 'sunday_wines',
                    name_es: 'Vinos Recomendados para el Asado',
                    name_en: 'Wine Pairings for Roasts',
                    icon: 'wine_bar',
                    items: [
                        {
                            id: 'sun_wn_1',
                            name: 'Malbec, Mendoza, Argentina',
                            price: 45.50,
                            desc_es: 'Intenso y sedoso con notas de ciruela y roble. Pareja perfecta para el Roast Beef.',
                            desc_en: 'Rich and velvety with plum and dark berry notes. Perfect match for Roast Beef.',
                            tags: ['wine', 'red'],
                            allergens: ['sulphites']
                        },
                        {
                            id: 'sun_wn_2',
                            name: 'Chianti Classico DOCG, Italy',
                            price: 45.50,
                            desc_es: 'Elegante y equilibrado con toques de cereza y especias. Ideal con el Cordero o Cerdo.',
                            desc_en: 'Medium-bodied, bright cherries with earthy complexity. Fantastic with Lamb or Pork.',
                            tags: ['wine', 'red'],
                            allergens: ['sulphites']
                        },
                        {
                            id: 'sun_wn_3',
                            name: 'Rioja Gran Reserva, Spain',
                            price: 51.00,
                            desc_es: 'Añejo redondo con notas de vainilla, tabaco y frutos negros. Gran maridaje para todos los asados.',
                            desc_en: 'Classic aged Rioja with subtle oak vanilla and dark dried fruits.',
                            tags: ['wine', 'red', 'premium'],
                            allergens: ['sulphites']
                        }
                    ]
                }
            ]
        }
    ]
};
