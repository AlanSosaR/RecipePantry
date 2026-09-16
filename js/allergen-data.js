/**
 * UK Food Standards Agency (FSA) 14 Major Allergens
 * Base de datos de alérgenos oficiales con ejemplos culinarios prácticos,
 * fuentes de contaminación cruzada y palabras clave para auto-detección.
 */

window.UK_ALLERGENS = [
    {
        id: 'celery',
        name_es: 'Apio',
        name_en: 'Celery',
        icon: 'spa',
        color: '#2E7D32',
        bg: '#E8F5E9',
        border: '#A5D6A7',
        whereItHides_es: 'Pastillas de caldo (Knorr, Bovril), sal de apio, sofrito clásico (mirepoix), sopas preparadas, cóctel Bloody Mary, mezclas de especias preparadas.',
        whereItHides_en: 'Stock cubes (Knorr, Bovril), celery salt, mirepoix bases, pre-made soups, Bloody Mary cocktails, spice blends.',
        contaminationRisks_es: 'Tablas de picar donde se corta apio para caldos, cuchillos de chef no higienizados entre preparaciones, batidoras de purés.',
        contaminationRisks_en: 'Chopping boards used for mirepoix, unwashed chef knives between tasks, shared soup blenders.',
        keywords: ['apio', 'celery', 'mirepoix', 'sal de apio', 'celery salt', 'knorr', 'bovril', 'cubito de caldo']
    },
    {
        id: 'gluten',
        name_es: 'Gluten (Cereales)',
        name_en: 'Gluten',
        icon: 'bakery_dining',
        color: '#D97706',
        bg: '#FEF3C7',
        border: '#FDE68A',
        whereItHides_es: 'Harina de trigo, pan rallado, pasta, cerveza, salsa de soja regular, bechamel, rebozados, galletas, salsa espesada con harina, cuscús, avena común.',
        whereItHides_en: 'Wheat flour, breadcrumbs, pasta, beer, standard soy sauce, roux/béchamel, batters, biscuits, thickened gravies, couscous, oats.',
        contaminationRisks_es: '¡El #1 en cocinas! Freidoras compartidas (freír patatas en el mismo aceite de croquetas o rebozados), tostadoras de pan, harina volátil en el aire.',
        contaminationRisks_en: '#1 in kitchens! Shared deep fat fryers (chips fried with battered fish/croquettes), toasters, airborne flour dust.',
        keywords: ['harina', 'trigo', 'gluten', 'flour', 'wheat', 'pan', 'bread', 'pasta', 'cerveza', 'beer', 'soja', 'soy sauce', 'breadcrumbs', 'pan rallado', 'bechamel', 'oats', 'avena', 'cebada', 'barley', 'centeno', 'rye', 'cuscus', 'couscous', 'hojaldre', 'pastry']
    },
    {
        id: 'crustaceans',
        name_es: 'Crustáceos',
        name_en: 'Crustaceans',
        icon: 'phishing',
        color: '#DC2626',
        bg: '#FEE2E2',
        border: '#FECACA',
        whereItHides_es: 'Gambas, langostinos, cangrejos, langosta, pasta de gambas asiática (shrimp paste en currys tailandeses), fumets de marisco.',
        whereItHides_en: 'Prawns, shrimp, crabs, lobster, langoustines, Asian shrimp paste (in Thai curries), seafood stocks.',
        contaminationRisks_es: 'Woks y sartenes de salteados que no se lavan entre platos, aceites de fritura compartidos, pinzas de parrilla.',
        contaminationRisks_en: 'Woks and sauté pans not scrubbed between orders, shared frying oils, grill tongs.',
        keywords: ['gamba', 'gambas', 'langostino', 'langostinos', 'prawn', 'prawns', 'shrimp', 'crab', 'cangrejo', 'lobster', 'langosta', 'shrimp paste', 'pasta de gamba', 'marisco']
    },
    {
        id: 'eggs',
        name_es: 'Huevos',
        name_en: 'Eggs',
        icon: 'egg',
        color: '#CA8A04',
        bg: '#FEF9C3',
        border: '#FEF08A',
        whereItHides_es: 'Mayonesa, salsa holandesa, merengues, pasta fresca al huevo, masa de tartas, barnizado de bollos/brioche con huevo, albóndigas (aglutinante).',
        whereItHides_en: 'Mayonnaise, hollandaise, meringues, egg pasta, cake batters, pastry glazes on buns/brioche, meatballs/burgers (binder).',
        contaminationRisks_es: 'Pinceles de pastelería, batidoras varilla compartidas, planchas donde se hacen tortillas o hamburguesas con huevo.',
        contaminationRisks_en: 'Pastry egg-wash brushes, shared whisk mixers, griddle tops used for fried eggs/omelettes.',
        keywords: ['huevo', 'huevos', 'egg', 'eggs', 'mayonesa', 'mayonnaise', 'yema', 'clara', 'holandesa', 'hollandaise', 'merengue', 'brioche']
    },
    {
        id: 'fish',
        name_es: 'Pescado',
        name_en: 'Fish',
        icon: 'set_meal',
        color: '#0284C7',
        bg: '#E0F2FE',
        border: '#BAE6FD',
        whereItHides_es: 'Salsa Worcestershire (Lea & Perrins contiene anchoas), aderezo de ensalada César, salsa de pescado asiática (nam pla), gelatinas, caldos concentrados.',
        whereItHides_en: 'Worcestershire sauce (Lea & Perrins has anchovies), Caesar salad dressing, Asian fish sauce (nam pla), fish gelatin, stocks.',
        contaminationRisks_es: 'Tablas de corte de pescadería, aceites de fritura, planchas de marcado rápido de carnes y pescados.',
        contaminationRisks_en: 'Fish cutting boards, deep fryer oil, flat-top grills used for both meats and fish.',
        keywords: ['pescado', 'fish', 'anchoa', 'anchoas', 'anchovy', 'anchovies', 'atun', 'tuna', 'salmon', 'worcestershire', 'cesar', 'caesar', 'nam pla', 'fumet', 'bacalao', 'cod', 'merluza']
    },
    {
        id: 'lupin',
        name_es: 'Altramuces',
        name_en: 'Lupin',
        icon: 'local_florist',
        color: '#9333EA',
        bg: '#F3E8FF',
        border: '#E9D5FF',
        whereItHides_es: 'Harina de altramuz en panes artesanales europeos, masas de pizza rústicas, tartas y productos de panadería vegana o sin gluten.',
        whereItHides_en: 'Lupin flour used in artisan European breads, pizza dough, vegan bakery items, specialty gluten-free baked goods.',
        contaminationRisks_es: 'Harinas volátiles en obradores de panadería, contenedores de harina compartidos.',
        contaminationRisks_en: 'Airborne flour in bakery prep rooms, shared bulk flour bins.',
        keywords: ['altramuz', 'altramuces', 'lupin', 'harina de altramuz', 'lupine']
    },
    {
        id: 'milk',
        name_es: 'Leche (Lácteos)',
        name_en: 'Milk',
        icon: 'water_drop',
        color: '#2563EB',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        whereItHides_es: 'Mantequilla, queso, nata (crema de leche), yogur, suero lácteo (whey), leche en polvo en panes de molde, bechamel, chocolate con leche, purés.',
        whereItHides_en: 'Butter, cheese, double/single cream, yogurt, whey protein, milk powder in packaged breads, béchamel, milk chocolate, mashed potatoes.',
        contaminationRisks_es: 'Espumadores de vapor de cafeteras, cucharas para servir purés con mantequilla, recipientes de postres no esterilizados.',
        contaminationRisks_en: 'Coffee machine steam wands, serving spoons for buttered mash, shared dessert cookware.',
        keywords: ['leche', 'milk', 'mantequilla', 'butter', 'queso', 'cheese', 'nata', 'cream', 'yogur', 'yogurt', 'suero', 'whey', 'parmesano', 'cheddar', 'mozzarella', 'lacteo', 'dairy']
    },
    {
        id: 'molluscs',
        name_es: 'Moluscos',
        name_en: 'Molluscs',
        icon: 'water',
        color: '#0D9488',
        bg: '#CCFBF1',
        border: '#99F6E4',
        whereItHides_es: 'Mejillones, almejas, calamares, pulpo, ostras, salsa de ostras (Oyster sauce típica en salteados chinos), paellas marineras, caldos.',
        whereItHides_en: 'Mussels, clams, squid, calamari, octopus, oysters, oyster sauce (common in Chinese stir-fries), seafood stews/chowder.',
        contaminationRisks_es: 'Agua de cocción de mariscos compartida, woks donde se salteó con salsa de ostras, cucharas de degustación.',
        contaminationRisks_en: 'Shared pasta/seafood boiling water, woks coated with oyster sauce residues, tasting spoons.',
        keywords: ['mejillon', 'mejillones', 'mussel', 'mussels', 'calamar', 'calamares', 'squid', 'calamari', 'pulpo', 'octopus', 'ostra', 'ostras', 'oyster', 'oyster sauce', 'almeja', 'almejas', 'clam', 'clams']
    },
    {
        id: 'mustard',
        name_es: 'Mostaza',
        name_en: 'Mustard',
        icon: 'grain',
        color: '#EAB308',
        bg: '#FEFCE8',
        border: '#FEF08A',
        whereItHides_es: 'Mostaza Dijon, inglesa o en grano, vinagretas de ensalada, mayonesas compuestas, marinadas de asados, mezclas de curry en polvo.',
        whereItHides_en: 'Dijon, English or wholegrain mustard, salad dressings, compound mayonnaises, barbecue marinades, curry powders.',
        contaminationRisks_es: 'Biberones de salsas compartidos, espátulas de hamburguesas, recipientes de aderezos abiertos en línea fría.',
        contaminationRisks_en: 'Squeeze sauce bottles, burger turnaround spatulas, open dressing pans on cold lines.',
        keywords: ['mostaza', 'mustard', 'dijon', 'mostaza en grano', 'wholegrain mustard']
    },
    {
        id: 'peanuts',
        name_es: 'Cacahuetes (Maní)',
        name_en: 'Peanuts',
        icon: 'nutrition',
        color: '#B45309',
        bg: '#FEF3C7',
        border: '#FDE68A',
        whereItHides_es: 'Mantequilla de cacahuete, aceite de cacahuete, salsa Satay, currys del sudeste asiático, barritas energéticas, coberturas crujientes.',
        whereItHides_en: 'Peanut butter, peanut/groundnut oil, Satay sauce, Pad Thai, cereal bars, satay marinades, crunchy garnishes.',
        contaminationRisks_es: 'Cuchillos para untar mantequillas, tablas de corte de repostería, aceite para freír frutos secos.',
        contaminationRisks_en: 'Spread knives, pastry prep boards, oil vats used for nut frying.',
        keywords: ['cacahuete', 'cacahuetes', 'peanut', 'peanuts', 'mani', 'mantequilla de cacahuete', 'peanut butter', 'satay']
    },
    {
        id: 'sesame',
        name_es: 'Sésamo (Ajonjolí)',
        name_en: 'Sesame',
        icon: 'scatter_plot',
        color: '#78716C',
        bg: '#F5F5F4',
        border: '#E7E5E4',
        whereItHides_es: 'Tahini (ingrediente esencial del hummus y baba ganoush), aceite de sésamo en salteados, panes de hamburguesa con semillas, sushi, gomashio.',
        whereItHides_en: 'Tahini (in hummus and baba ganoush), sesame oil in stir-fries, sesame-topped burger buns, sushi rolls, gomashio seasoning.',
        contaminationRisks_es: 'Semillas sueltas que se dispersan en mesas de trabajo y planchas, tostadores donde caen semillas al fondo.',
        contaminationRisks_en: 'Loose seeds easily bouncing across prep benches and griddles, seed residue in bun toasters.',
        keywords: ['sesamo', 'sesame', 'tahini', 'tahina', 'hummus', 'ajonjoli', 'aceite de sesamo', 'sesame oil']
    },
    {
        id: 'soya',
        name_es: 'Soja',
        name_en: 'Soya',
        icon: 'eco',
        color: '#16A34A',
        bg: '#DCFCE7',
        border: '#BBF7D0',
        whereItHides_es: 'Salsa de soja, salsa teriyaki, tofu, edamame, miso, proteína vegetal texturizada (hamburguesas veganas), lecitina de soja (chocolates, panes industriales).',
        whereItHides_en: 'Soy sauce, teriyaki sauce, tofu, edamame, miso, textured vegetable protein, soya lecithin (emulsifier in chocolates and breads).',
        contaminationRisks_es: 'Woks y sartenes donde se salteó con salsa de soja, botellas dosificadoras de salsa, planchas.',
        contaminationRisks_en: 'Woks coated with soy sauce glazes, squeeze bottles, flat-top grills.',
        keywords: ['soja', 'soya', 'soy', 'soy sauce', 'tofu', 'edamame', 'miso', 'teriyaki', 'lecitina de soja', 'tamari']
    },
    {
        id: 'sulphites',
        name_es: 'Sulfitos',
        name_en: 'Sulphites',
        icon: 'science',
        color: '#9F1239',
        bg: '#FFE4E6',
        border: '#FECDD3',
        whereItHides_es: 'Vinos (tinto y blanco usados para reducciones y guisos), vinagres de vino, sidra, frutos secos deshidratados (pasas, orejones, dátiles), carnes procesadas/salchichas.',
        whereItHides_en: 'Wine (red/white in cooking reductions), wine vinegars, cider, dried fruits (raisins, dried apricots), processed burgers and sausages (preservative E220-E228).',
        contaminationRisks_es: 'Ollas y cazuelas donde se desglasó con vino, tablas donde se picaron pasas o frutas secas sulfuradas.',
        contaminationRisks_en: 'Pans deglazed with cooking wine, boards where dried sulphured fruits were chopped.',
        keywords: ['vino', 'wine', 'sulfito', 'sulfitos', 'sulphite', 'sulphites', 'pasas', 'raisins', 'orejones', 'sidra', 'cider', 'vinagre de vino']
    },
    {
        id: 'nuts',
        name_es: 'Frutos Secos (Cáscara)',
        name_en: 'Tree Nuts',
        icon: 'nature',
        color: '#7C2D12',
        bg: '#FFEDD5',
        border: '#FED7AA',
        whereItHides_es: 'Pesto tradicional (piñones o nueces), mazapán, praliné, harina de almendra (macarons, tartas), nueces en ensaladas, leches vegetales de almendra/avellana.',
        whereItHides_en: 'Traditional pesto (pine nuts/walnuts), marzipan, praline, almond flour (macarons, cakes), nuts in salads, almond/cashew plant milks.',
        contaminationRisks_es: 'Picadoras y robots de cocina (Thermomix, procesadores) no lavados a fondo, mangas pasteleras, tablas de repostería.',
        contaminationRisks_en: 'Food processors (Thermomix, blenders) not sanitized, piping bags, bakery cutting boards.',
        keywords: ['nuez', 'nueces', 'walnut', 'walnuts', 'almendra', 'almendras', 'almond', 'almonds', 'avellana', 'avellanas', 'hazelnut', 'hazelnuts', 'pistacho', 'pistachos', 'pistachio', 'pistachios', 'anacardo', 'anacardos', 'cashew', 'cashews', 'pinon', 'pinones', 'pine nuts', 'pesto', 'pecana', 'pecans', 'macadamia']
    }
];

/**
 * Analizador automático de recetas
 * Examina los ingredientes de una receta y devuelve la lista de alérgenos detectados
 */
window.detectRecipeAllergens = function(recipe) {
    if (!recipe) return [];
    
    // Si la receta ya tiene alérgenos guardados manualmente en tags (ej: "allergen:gluten")
    const manualAllergens = [];
    if (recipe.tags && Array.isArray(recipe.tags)) {
        recipe.tags.forEach(tag => {
            if (typeof tag === 'string' && tag.startsWith('allergen:')) {
                const id = tag.replace('allergen:', '').trim().toLowerCase();
                if (window.UK_ALLERGENS.some(a => a.id === id)) {
                    manualAllergens.push(id);
                }
            }
        });
    }
    
    // Si ya tiene etiquetas manuales registradas, las respetamos
    if (manualAllergens.length > 0) {
        return Array.from(new Set(manualAllergens));
    }

    // De lo contrario, realizamos escaneo automático sobre los ingredientes y nombre
    const detected = new Set();
    const textsToScan = [];
    
    if (recipe.name_es) textsToScan.push(recipe.name_es.toLowerCase());
    if (recipe.name_en) textsToScan.push(recipe.name_en.toLowerCase());
    if (recipe.description_es) textsToScan.push(recipe.description_es.toLowerCase());
    if (recipe.description_en) textsToScan.push(recipe.description_en.toLowerCase());

    if (Array.isArray(recipe.ingredients)) {
        recipe.ingredients.forEach(ing => {
            if (typeof ing === 'string') {
                textsToScan.push(ing.toLowerCase());
            } else if (ing && typeof ing === 'object') {
                if (ing.name_es) textsToScan.push(ing.name_es.toLowerCase());
                if (ing.name_en) textsToScan.push(ing.name_en.toLowerCase());
                if (ing.name) textsToScan.push(ing.name.toLowerCase());
            }
        });
    }

    const fullContent = textsToScan.join(' ');

    window.UK_ALLERGENS.forEach(allergen => {
        const found = allergen.keywords.some(kw => {
            const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(^|[^a-záéíóúñ])${escaped}([^a-záéíóúñ]|$)`, 'i');
            return regex.test(fullContent);
        });
        if (found) {
            detected.add(allergen.id);
        }
    });

    return Array.from(detected);
};

/**
 * Platos de demostración culinaria estándar (UK Hospitality & FSA)
 * Permiten que la Matriz Oficial y el Filtro de Comensal Seguro muestren datos reales
 * y ejemplos de aplicación incluso antes de que el usuario haya guardado recetas propias.
 */
window.DEMO_UK_RECIPES = [
    {
        id: 'demo-fish-chips',
        is_demo: true,
        name_es: 'Fish & Chips Tradicional con Salsa Tártara',
        name_en: 'Traditional British Fish & Chips with Tartar Sauce',
        description_es: 'Filete de bacalao fresco rebozado en harina de trigo y cerveza crujiente, servido con patatas y salsa tártara casera con huevo y mostaza.',
        description_en: 'Fresh Atlantic cod in crispy wheat beer batter, served with chunky chips, mushy peas, and tartar sauce.',
        ingredients: [
            { name: 'Filete de bacalao fresco del Atlántico' },
            { name: 'Harina de trigo y cerveza para rebozado' },
            { name: 'Salsa tártara con mayonesa (yema de huevo) y mostaza' },
            { name: 'Patatas fritas en aceite de girasol' },
            { name: 'Guisantes verdes triturados' }
        ]
    },
    {
        id: 'demo-carbonara',
        is_demo: true,
        name_es: 'Pasta Carbonara Romana Auténtica',
        name_en: 'Authentic Roman Pasta Carbonara',
        description_es: 'Espaguetis de trigo duro con guanciale crujiente salteado, emulsión de yemas de huevo fresco y queso Pecorino Romano.',
        description_en: 'Durum wheat spaghetti tossed with crispy cured guanciale, farm-fresh egg yolks, and aged Pecorino Romano cheese.',
        ingredients: [
            { name: 'Espaguetis de sémola de trigo duro' },
            { name: 'Guanciale curado de cerdo' },
            { name: 'Yemas de huevo fresco de granja' },
            { name: 'Queso Pecorino Romano y Parmesano' },
            { name: 'Pimienta negra recién molida' }
        ]
    },
    {
        id: 'demo-pad-thai',
        is_demo: true,
        name_es: 'Pad Thai con Langostinos y Cacahuetes Tostados',
        name_en: 'King Prawn Pad Thai with Roasted Peanuts',
        description_es: 'Fideos de arroz al wok con langostinos tigres, dados de tofu de soja, salsa de pescado tailandesa, huevo y cacahuetes picados.',
        description_en: 'Wok-tossed rice noodles with king prawns, fried soya tofu, savory fish sauce, scrambled eggs, and crushed peanuts.',
        ingredients: [
            { name: 'Fideos de arroz tailandeses' },
            { name: 'Langostinos tigres frescos' },
            { name: 'Tofu firme de soja' },
            { name: 'Salsa de pescado tradicional (nam pla)' },
            { name: 'Huevos revueltos al wok' },
            { name: 'Cacahuetes tostados picados' },
            { name: 'Brotes de soja y lima' }
        ]
    },
    {
        id: 'demo-caesar',
        is_demo: true,
        name_es: 'Ensalada César con Pollo a la Brasa y Picatostes',
        name_en: 'Chargrilled Chicken Caesar Salad with Croutons',
        description_es: 'Pechuga de pollo a la brasa sobre lechuga romana, picatostes de pan crujiente, láminas de queso parmesano y aderezo con anchoas y mostaza.',
        description_en: 'Grilled chicken breast on crisp romaine, herb wheat croutons, shaved parmesan, and creamy dressing with anchovies and mustard.',
        ingredients: [
            { name: 'Pechuga de pollo a la brasa' },
            { name: 'Lechuga romana fresca' },
            { name: 'Picatostes de pan de trigo' },
            { name: 'Queso Parmigiano Reggiano en lascas' },
            { name: 'Aderezo César con anchoas, yema de huevo y mostaza de Dijon' }
        ]
    },
    {
        id: 'demo-satay',
        is_demo: true,
        name_es: 'Brochetas de Pollo Satay con Salsa de Cacahuete y Sésamo',
        name_en: 'Chicken Satay Skewers with Peanut & Sesame Sauce',
        description_es: 'Brochetas de pollo marinadas con cúrcuma y cilantro, acompañadas de salsa tibia de crema de cacahuete, salsa de soja y sésamo tostado.',
        description_en: 'Spiced chicken skewers served with warm peanut sauce, dark soy sauce, and toasted sesame seeds.',
        ingredients: [
            { name: 'Pechuga de pollo marinada' },
            { name: 'Crema de cacahuete tostado' },
            { name: 'Salsa de soja tradicional fermentada' },
            { name: 'Semillas y aceite de sésamo tostado' },
            { name: 'Leche de coco y cilantro' }
        ]
    },
    {
        id: 'demo-minestrone',
        is_demo: true,
        name_es: 'Sopa Rústica Minestrone con Apio y Hortalizas (Vegana)',
        name_en: 'Rustic Vegetable Minestrone Soup with Celery (Vegan)',
        description_es: 'Sopa tradicional de tomate y verduras de huerta con apio fresco, zanahorias, alubias cannellini y aceite de oliva virgen extra.',
        description_en: 'Classic Italian vegetable soup made with rich tomato base, fresh diced celery, carrots, white beans, and extra virgin olive oil.',
        ingredients: [
            { name: 'Tomate triturado y caldo de verduras' },
            { name: 'Apio fresco picado y sal de apio' },
            { name: 'Zanahorias, calabacín y puerro' },
            { name: 'Alubias blancas (cannellini)' },
            { name: 'Aceite de oliva virgen extra y albahaca' }
        ]
    },
    {
        id: 'demo-risotto',
        is_demo: true,
        name_es: 'Risotto de Setas Silvestres con Mantequilla y Vino Blanco',
        name_en: 'Wild Mushroom Risotto with Butter & White Wine',
        description_es: 'Arroz arborio cremoso cocinado lentamente con setas silvestres, mantequilla de leche fresca, vino blanco y caldo con apio.',
        description_en: 'Creamy arborio rice simmered with wild mushrooms, unsalted butter, white wine, and celery-infused vegetable stock.',
        ingredients: [
            { name: 'Arroz italiano arborio' },
            { name: 'Setas boletus y champiñones' },
            { name: 'Mantequilla fresca y queso parmesano' },
            { name: 'Caldo vegetal aromático con apio' },
            { name: 'Vino blanco para desglasar (sulfitos)' }
        ]
    }
];

/**
 * Perfiles rápidos de comensal habituales en hostelería (UK & Internacional)
 * Permiten preseleccionar con 1 solo clic en el Split Button los alérgenos a excluir.
 */
window.UK_DIETARY_PROFILES = [
    {
        id: 'celiac',
        name_es: 'Celíaco / Sin Gluten',
        name_en: 'Coeliac / Gluten-Free',
        icon: 'bakery_dining',
        color: '#D97706',
        allergens: ['gluten']
    },
    {
        id: 'lactose',
        name_es: 'Sin Lactosa / Lácteos',
        name_en: 'Lactose & Dairy-Free',
        icon: 'water_drop',
        color: '#2563EB',
        allergens: ['milk']
    },
    {
        id: 'nuts',
        name_es: 'Alergia a Frutos Secos y Maní',
        name_en: 'Nut Allergy (Peanuts & Tree Nuts)',
        icon: 'nutrition',
        color: '#EA580C',
        allergens: ['peanuts', 'nuts']
    },
    {
        id: 'seafood',
        name_es: 'Alergia al Marisco y Pescado',
        name_en: 'Seafood, Shellfish & Fish',
        icon: 'phishing',
        color: '#DC2626',
        allergens: ['crustaceans', 'molluscs', 'fish']
    },
    {
        id: 'vegan',
        name_es: 'Vegano Estricto',
        name_en: 'Strict Vegan Diet',
        icon: 'eco',
        color: '#059669',
        allergens: ['eggs', 'milk', 'fish', 'crustaceans', 'molluscs']
    },
    {
        id: 'eggs',
        name_es: 'Alérgico al Huevo',
        name_en: 'Egg-Free Diet',
        icon: 'egg',
        color: '#CA8A04',
        allergens: ['eggs']
    }
];


