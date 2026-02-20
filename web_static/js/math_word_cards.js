/**
 * Math Word Vault - 數學詞彙寶庫
 * 包含完整中二詞彙數據和所有遊戲模式
 * 已增強：Visual Card 現在顯示真實幾何圖形
 */

// ==================== 中二數學詞彙數據庫 ====================
const MATH_VOCABULARY = {
    s2: [
        { term: "adjacent side", chinese: "鄰邊", definition: "In a right-angled triangle, the side next to a given angle (not the hypotenuse)", example: "Find the length of the adjacent side.", category: "trigonometry", confusion: "opposite side（對邊）" },
        { term: "angle", chinese: "角", definition: "A figure formed by two rays sharing a common endpoint", example: "∠ABC = 45°", category: "geometry", confusion: null },
        { term: "angle at centre", chinese: "圓心角", definition: "An angle whose vertex is at the center of a circle", example: "The angle at centre is twice the angle at circumference.", category: "circle", confusion: "angle at circumference（圓周角）" },
        { term: "angle bisector", chinese: "角平分線", definition: "A line that divides an angle into two equal parts", example: "Draw the angle bisector of ∠ABC.", category: "geometry", confusion: "perpendicular bisector（垂直平分線）" },
        { term: "angle of the sector", chinese: "扇形角", definition: "The central angle of a sector", example: "The angle of the sector is 60°.", category: "circle", confusion: null },
        { term: "arc", chinese: "弧", definition: "A part of the circumference of a circle", example: "Arc AB is a minor arc.", category: "circle", confusion: "arc length（弧長）" },
        { term: "arc length", chinese: "弧長", definition: "The distance along an arc", example: "Find the arc length of the sector.", category: "circle", confusion: "arc（弧）" },
        { term: "algebraic fraction", chinese: "代數分式", definition: "A fraction containing algebraic expressions", example: "Simplify the algebraic fraction (x+1)/(x-1).", category: "algebra", confusion: null },
        { term: "algebraic powers", chinese: "代數冪", definition: "Expressions with variables raised to powers", example: "x³ is an algebraic power.", category: "algebra", confusion: null },
        { term: "axiom", chinese: "公理", definition: "A statement accepted as true without proof", example: "Through two points, there is exactly one line.", category: "logic", confusion: "theorem（定理）" },
        { term: "base", chinese: "底", definition: "The bottom side of a shape, or the number being raised to a power", example: "The base of the triangle is 10 cm.", category: "geometry", confusion: null },
        { term: "benchmark strategy", chinese: "基準策略", definition: "Using reference points to estimate or compare", example: "Use 50% as a benchmark.", category: "statistics", confusion: null },
        { term: "bisector", chinese: "平分線", definition: "A line that divides something into two equal parts", example: "The bisector divides the segment equally.", category: "geometry", confusion: null },
        { term: "binomial", chinese: "二項式", definition: "An algebraic expression with two terms", example: "(x + 2) is a binomial.", category: "algebra", confusion: "monomial（單項式）, polynomial（多項式）" },
        { term: "class interval", chinese: "組距", definition: "The range of values in each group of a frequency distribution", example: "The class interval is 10.", category: "statistics", confusion: "class mark（組中點）" },
        { term: "class mark", chinese: "組中點", definition: "The middle value of a class interval", example: "The class mark of 10-20 is 15.", category: "statistics", confusion: "class interval（組距）" },
        { term: "coefficient", chinese: "係數", definition: "The numerical factor of a term", example: "In 3x², the coefficient is 3.", category: "algebra", confusion: null },
        { term: "common factor", chinese: "公因數", definition: "A factor shared by two or more numbers", example: "The common factor of 12 and 18 is 6.", category: "number", confusion: "common multiple（公倍數）" },
        { term: "common multiple", chinese: "公倍數", definition: "A multiple shared by two or more numbers", example: "The LCM of 4 and 6 is 12.", category: "number", confusion: "common factor（公因數）" },
        { term: "compound interest", chinese: "複利", definition: "Interest calculated on both principal and accumulated interest", example: "Calculate the compound interest after 3 years.", category: "finance", confusion: "simple interest（單利）" },
        { term: "congruent figures", chinese: "全等圖形", definition: "Figures with the same shape and size", example: "△ABC ≅ △DEF", category: "geometry", confusion: "similar figures（相似圖形）" },
        { term: "converse", chinese: "逆命題", definition: "A statement formed by exchanging the hypothesis and conclusion", example: "The converse of 'If A then B' is 'If B then A'.", category: "logic", confusion: null },
        { term: "converse theorem", chinese: "逆定理", definition: "The theorem stating the converse of another theorem", example: "The converse of Pythagoras' theorem.", category: "logic", confusion: null },
        { term: "cosine", chinese: "餘弦", definition: "In a right triangle, the ratio of the adjacent side to the hypotenuse", example: "cos θ = adjacent/hypotenuse", category: "trigonometry", confusion: "sine（正弦）, tangent（正切）" },
        { term: "cube root", chinese: "立方根", definition: "A number that when cubed gives the original number", example: "The cube root of 27 is 3.", category: "number", confusion: "square root（平方根）" },
        { term: "cumulative frequency", chinese: "累積頻率", definition: "The running total of frequencies", example: "Draw a cumulative frequency curve.", category: "statistics", confusion: "frequency（頻率）" },
        { term: "cumulative frequency curve", chinese: "累積頻率曲線", definition: "A graph showing cumulative frequencies", example: "Use the cumulative frequency curve to find the median.", category: "statistics", confusion: null },
        { term: "decimal", chinese: "小數", definition: "A number written using a decimal point", example: "0.75 is a decimal.", category: "number", confusion: "fraction（分數）" },
        { term: "decomposition", chinese: "分解", definition: "Breaking down into simpler parts", example: "Factor decomposition of 12 = 2² × 3.", category: "algebra", confusion: null },
        { term: "deduction", chinese: "演繹", definition: "Logical reasoning from general to specific", example: "By deduction, the angle must be 90°.", category: "logic", confusion: "induction（歸納）" },
        { term: "definition", chinese: "定義", definition: "A precise statement of the meaning of a term", example: "By definition, a square has four equal sides.", category: "logic", confusion: null },
        { term: "direct proportion", chinese: "正比例", definition: "A relationship where y = kx for some constant k", example: "y is directly proportional to x.", category: "algebra", confusion: "inverse proportion（反比例）" },
        { term: "expansion", chinese: "展開式", definition: "The result of multiplying out brackets", example: "(x+2)(x-3) = x² - x - 6", category: "algebra", confusion: "factorization（因式分解）" },
        { term: "experimental probability", chinese: "實驗概率", definition: "Probability based on actual experiments", example: "The experimental probability of heads is 0.48.", category: "probability", confusion: "theoretical probability（理論概率）" },
        { term: "factor", chinese: "因數", definition: "A number that divides evenly into another", example: "3 is a factor of 12.", category: "number", confusion: "multiple（倍數）" },
        { term: "fractional indices", chinese: "分數指數", definition: "Exponents that are fractions", example: "x^(1/2) = √x", category: "algebra", confusion: null },
        { term: "frequency", chinese: "頻率", definition: "The number of times a value occurs", example: "The frequency of score 80 is 5.", category: "statistics", confusion: "cumulative frequency（累積頻率）" },
        { term: "frequency curve", chinese: "頻率曲線", definition: "A smooth curve representing frequency distribution", example: "Draw a frequency curve for the data.", category: "statistics", confusion: "frequency polygon（頻率多邊形）" },
        { term: "frequency polygon", chinese: "頻率多邊形", definition: "A line graph of frequencies using class marks", example: "Construct a frequency polygon.", category: "statistics", confusion: "histogram（直方圖）" },
        { term: "graph", chinese: "圖/圖表", definition: "A visual representation of data or functions", example: "Plot the graph of y = 2x + 1.", category: "general", confusion: null },
        { term: "histogram", chinese: "直方圖", definition: "A bar chart where bars touch and width represents class interval", example: "Draw a histogram for the grouped data.", category: "statistics", confusion: "bar chart（條形圖）" },
        { term: "hypotenuse", chinese: "斜邊", definition: "The longest side of a right-angled triangle, opposite the right angle", example: "The hypotenuse is 13 cm.", category: "trigonometry", confusion: "adjacent side（鄰邊）, opposite side（對邊）" },
        { term: "identity", chinese: "恆等式", definition: "An equation true for all values of the variable", example: "(a+b)² = a² + 2ab + b² is an identity.", category: "algebra", confusion: "equation（方程）" },
        { term: "irrational number", chinese: "無理數", definition: "A number that cannot be expressed as a fraction", example: "π and √2 are irrational numbers.", category: "number", confusion: "rational number（有理數）" },
        { term: "linear equation", chinese: "線性方程", definition: "An equation whose graph is a straight line", example: "2x + 3y = 6 is a linear equation.", category: "algebra", confusion: "quadratic equation（二次方程）" },
        { term: "lower class boundary", chinese: "下組界", definition: "The lower limit of a class interval adjusted for continuity", example: "For class 10-19, the lower class boundary is 9.5.", category: "statistics", confusion: "lower class limit（下組限）" },
        { term: "lower class limit", chinese: "下組限", definition: "The smallest value in a class interval", example: "For class 10-19, the lower class limit is 10.", category: "statistics", confusion: "lower class boundary（下組界）" },
        { term: "midpoint", chinese: "中點", definition: "The point exactly in the middle of a line segment", example: "M is the midpoint of AB.", category: "geometry", confusion: null },
        { term: "multiplication law of powers", chinese: "冪的乘法法則", definition: "When multiplying powers with same base, add exponents", example: "x³ × x² = x⁵", category: "algebra", confusion: null },
        { term: "nth root", chinese: "n次方根", definition: "A number that when raised to power n gives the original", example: "The 4th root of 16 is 2.", category: "number", confusion: null },
        { term: "opposite side", chinese: "對邊", definition: "In a right triangle, the side opposite to a given angle", example: "Find the opposite side using sine.", category: "trigonometry", confusion: "adjacent side（鄰邊）" },
        { term: "order", chinese: "次序/階", definition: "The arrangement or rank of elements", example: "Arrange in ascending order.", category: "general", confusion: null },
        { term: "perpendicular bisector", chinese: "垂直平分線", definition: "A line perpendicular to a segment passing through its midpoint", example: "AB is the perpendicular bisector of CD.", category: "geometry", confusion: "angle bisector（角平分線）" },
        { term: "percentage error", chinese: "百分誤差", definition: "The error expressed as a percentage of the true value", example: "The percentage error is 5%.", category: "measurement", confusion: null },
        { term: "Pythagoras' theorem", chinese: "畢氏定理", definition: "In a right triangle, a² + b² = c² where c is the hypotenuse", example: "Use Pythagoras' theorem to find the hypotenuse.", category: "geometry", confusion: null },
        { term: "Pythagorean triple", chinese: "畢氏三元組", definition: "Three positive integers satisfying Pythagoras' theorem", example: "3, 4, 5 is a Pythagorean triple.", category: "geometry", confusion: null },
        { term: "quadratic surd", chinese: "二次根式", definition: "An expression containing square roots", example: "√2 + √3 is a quadratic surd.", category: "algebra", confusion: null },
        { term: "ratio", chinese: "比/比例", definition: "A comparison of two quantities", example: "The ratio of boys to girls is 3:2.", category: "number", confusion: "rate（率）" },
        { term: "rate", chinese: "率", definition: "A ratio comparing quantities with different units", example: "The speed is 60 km/h.", category: "number", confusion: "ratio（比）" },
        { term: "rational number", chinese: "有理數", definition: "A number that can be expressed as a fraction p/q", example: "0.75 = 3/4 is a rational number.", category: "number", confusion: "irrational number（無理數）" },
        { term: "rationalization of the denominator", chinese: "分母有理化", definition: "Eliminating surds from the denominator", example: "1/√2 = √2/2", category: "algebra", confusion: null },
        { term: "recurring decimal", chinese: "循環小數", definition: "A decimal with infinitely repeating digits", example: "1/3 = 0.333... is a recurring decimal.", category: "number", confusion: null },
        { term: "reciprocal", chinese: "倒數", definition: "The multiplicative inverse of a number", example: "The reciprocal of 4 is 1/4.", category: "number", confusion: null },
        { term: "scale drawing", chinese: "比例圖", definition: "A drawing with lengths in proportion to actual lengths", example: "The scale drawing uses 1:100.", category: "geometry", confusion: null },
        { term: "scalene triangle", chinese: "不等邊三角形", definition: "A triangle with all sides of different lengths", example: "A scalene triangle has no equal sides.", category: "geometry", confusion: "isosceles triangle（等腰三角形）" },
        { term: "sector", chinese: "扇形", definition: "A region bounded by two radii and an arc", example: "Find the area of the sector.", category: "circle", confusion: "segment（弓形）" },
        { term: "simultaneous linear equations", chinese: "聯立線性方程", definition: "A system of two or more linear equations", example: "Solve: x + y = 5, x - y = 1.", category: "algebra", confusion: null },
        { term: "similar figures", chinese: "相似圖形", definition: "Figures with the same shape but possibly different sizes", example: "△ABC ~ △DEF", category: "geometry", confusion: "congruent figures（全等圖形）" },
        { term: "square", chinese: "正方形/平方", definition: "A quadrilateral with four equal sides and four right angles", example: "The square of 5 is 25.", category: "geometry", confusion: null },
        { term: "square root", chinese: "平方根", definition: "A number that when squared gives the original number", example: "The square root of 16 is 4.", category: "number", confusion: "cube root（立方根）" },
        { term: "standard form", chinese: "標準式", definition: "Scientific notation: a × 10ⁿ where 1 ≤ a < 10", example: "3,500,000 = 3.5 × 10⁶", category: "number", confusion: null },
        { term: "substitution", chinese: "代入法", definition: "Replacing a variable with a value or expression", example: "Use substitution to solve the equations.", category: "algebra", confusion: null },
        { term: "tangent", chinese: "正切/切線", definition: "The ratio opposite/adjacent in a right triangle", example: "tan θ = opposite/adjacent", category: "trigonometry", confusion: "sine（正弦）, cosine（餘弦）" },
        { term: "term", chinese: "項", definition: "A single number, variable, or their product in an expression", example: "3x² has one term.", category: "algebra", confusion: null },
        { term: "trapezium", chinese: "梯形", definition: "A quadrilateral with exactly one pair of parallel sides", example: "ABCD is a trapezium with AB // CD.", category: "geometry", confusion: "parallelogram（平行四邊形）" },
        { term: "triangle", chinese: "三角形", definition: "A polygon with three sides", example: "△ABC has three vertices.", category: "geometry", confusion: null },
        { term: "trigonometric ratio", chinese: "三角比", definition: "The ratios sine, cosine, and tangent", example: "Use trigonometric ratios to find the angle.", category: "trigonometry", confusion: null },
        { term: "unit", chinese: "單位", definition: "A standard quantity used for measurement", example: "The unit of length is meter.", category: "measurement", confusion: null },
        { term: "vertical angle", chinese: "對頂角", definition: "Opposite angles formed by two intersecting lines", example: "Vertical angles are equal.", category: "geometry", confusion: null },
        { term: "whole number", chinese: "整數", definition: "Non-negative integers: 0, 1, 2, 3, ...", example: "7 is a whole number.", category: "number", confusion: null }
    ],
    s1: [],
    s3: []
};

const CATEGORIES = { all: "全部", geometry: "幾何", algebra: "代數", trigonometry: "三角學", circle: "圓形", number: "數", statistics: "統計", probability: "概率", logic: "邏輯", measurement: "度量", finance: "財務", general: "一般" };

// ==================== 幾何圖形 SVG 數據庫 ====================
const GEOMETRY_VISUALS = {
    // ========== 基本幾何圖形 ==========
    "triangle": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="50,10 10,90 90,90" fill="none" stroke="currentColor" stroke-width="3"/>
            <text x="50" y="75" text-anchor="middle" class="geo-label">△ABC</text>
        </svg>`,
        category: "geometry"
    },
    "square": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <rect x="15" y="15" width="70" height="70" fill="none" stroke="currentColor" stroke-width="3"/>
            <text x="50" y="60" text-anchor="middle" class="geo-label">正方形</text>
        </svg>`,
        category: "geometry"
    },
    "trapezium": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="25,20 75,20 95,80 5,80" fill="none" stroke="currentColor" stroke-width="3"/>
            <text x="50" y="55" text-anchor="middle" class="geo-label">梯形</text>
        </svg>`,
        category: "geometry"
    },
    "scalene triangle": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="20,85 50,15 90,85" fill="none" stroke="currentColor" stroke-width="3"/>
            <text x="30" y="50" class="geo-small">a</text>
            <text x="70" y="50" class="geo-small">b</text>
            <text x="55" y="95" class="geo-small">c</text>
        </svg>`,
        category: "geometry"
    },

    // ========== 直角三角形相關 ==========
    "hypotenuse": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,85 10,20 90,85" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="10" y1="20" x2="90" y2="85" stroke="#0a84ff" stroke-width="4"/>
            <rect x="10" y="75" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
            <text x="55" y="45" fill="#0a84ff" class="geo-small">斜邊</text>
        </svg>`,
        category: "trigonometry"
    },
    "adjacent side": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,85 10,20 90,85" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="10" y1="85" x2="90" y2="85" stroke="#30d158" stroke-width="4"/>
            <rect x="10" y="75" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
            <path d="M 75,85 A 15,15 0 0 0 72,70" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <text x="65" y="72" class="geo-small">θ</text>
            <text x="50" y="98" fill="#30d158" class="geo-small">鄰邊</text>
        </svg>`,
        category: "trigonometry"
    },
    "opposite side": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,85 10,20 90,85" fill="none" stroke="currentColor" stroke-width="2"/>
            <line x1="10" y1="20" x2="10" y2="85" stroke="#ff9f0a" stroke-width="4"/>
            <rect x="10" y="75" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
            <path d="M 75,85 A 15,15 0 0 0 72,70" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <text x="65" y="72" class="geo-small">θ</text>
            <text x="3" y="55" fill="#ff9f0a" class="geo-small" writing-mode="vertical-rl">對邊</text>
        </svg>`,
        category: "trigonometry"
    },

    // ========== 角度相關 ==========
    "angle": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="10" y1="80" x2="90" y2="80" stroke="currentColor" stroke-width="2"/>
            <line x1="10" y1="80" x2="70" y2="20" stroke="currentColor" stroke-width="2"/>
            <path d="M 30,80 A 20,20 0 0 0 26,65" fill="none" stroke="#0a84ff" stroke-width="2"/>
            <text x="35" y="70" fill="#0a84ff" class="geo-label">∠ABC</text>
        </svg>`,
        category: "geometry"
    },
    "angle bisector": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="10" y1="85" x2="90" y2="85" stroke="currentColor" stroke-width="2"/>
            <line x1="10" y1="85" x2="80" y2="15" stroke="currentColor" stroke-width="2"/>
            <line x1="10" y1="85" x2="85" y2="50" stroke="#0a84ff" stroke-width="2" stroke-dasharray="5,3"/>
            <path d="M 25,85 A 15,15 0 0 0 22,73" fill="none" stroke="#30d158" stroke-width="1.5"/>
            <path d="M 30,77 A 20,20 0 0 0 32,65" fill="none" stroke="#30d158" stroke-width="1.5"/>
            <text x="50" y="60" fill="#0a84ff" class="geo-small">角平分線</text>
        </svg>`,
        category: "geometry"
    },
    "vertical angle": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="10" y1="10" x2="90" y2="90" stroke="currentColor" stroke-width="2"/>
            <line x1="90" y1="10" x2="10" y2="90" stroke="currentColor" stroke-width="2"/>
            <path d="M 55,50 A 8,8 0 0 0 50,42" fill="#0a84ff" fill-opacity="0.3" stroke="#0a84ff" stroke-width="1"/>
            <path d="M 45,50 A 8,8 0 0 0 50,58" fill="#0a84ff" fill-opacity="0.3" stroke="#0a84ff" stroke-width="1"/>
            <text x="62" y="35" fill="#0a84ff" class="geo-small">對頂角</text>
        </svg>`,
        category: "geometry"
    },
    "angle at centre": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>
            <circle cx="50" cy="50" r="3" fill="currentColor"/>
            <line x1="50" y1="50" x2="85" y2="30" stroke="currentColor" stroke-width="2"/>
            <line x1="50" y1="50" x2="85" y2="70" stroke="currentColor" stroke-width="2"/>
            <path d="M 60,50 A 10,10 0 0 0 58,42" fill="none" stroke="#0a84ff" stroke-width="2"/>
            <text x="65" y="52" fill="#0a84ff" class="geo-small">圓心角</text>
        </svg>`,
        category: "circle"
    },

    // ========== 線段相關 ==========
    "midpoint": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" stroke-width="2"/>
            <circle cx="10" cy="50" r="4" fill="currentColor"/>
            <circle cx="90" cy="50" r="4" fill="currentColor"/>
            <circle cx="50" cy="50" r="5" fill="#0a84ff"/>
            <text x="10" y="70" class="geo-small">A</text>
            <text x="50" y="70" fill="#0a84ff" class="geo-small">M</text>
            <text x="90" y="70" class="geo-small">B</text>
            <text x="30" y="40" class="geo-tiny">AM = MB</text>
        </svg>`,
        category: "geometry"
    },
    "bisector": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" stroke-width="2"/>
            <line x1="50" y1="20" x2="50" y2="80" stroke="#0a84ff" stroke-width="2"/>
            <circle cx="50" cy="50" r="3" fill="#0a84ff"/>
            <text x="25" y="45" class="geo-tiny">等分</text>
            <text x="60" y="45" class="geo-tiny">等分</text>
        </svg>`,
        category: "geometry"
    },
    "perpendicular bisector": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="10" y1="60" x2="90" y2="60" stroke="currentColor" stroke-width="2"/>
            <line x1="50" y1="20" x2="50" y2="90" stroke="#0a84ff" stroke-width="2"/>
            <rect x="50" y="60" width="8" height="8" fill="none" stroke="#0a84ff" stroke-width="1.5"/>
            <circle cx="50" cy="60" r="3" fill="#0a84ff"/>
            <text x="55" y="40" fill="#0a84ff" class="geo-tiny">⊥平分線</text>
        </svg>`,
        category: "geometry"
    },

    // ========== 圓形相關 ==========
    "arc": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3"/>
            <path d="M 15,65 A 40,40 0 0 1 85,65" fill="none" stroke="#0a84ff" stroke-width="4"/>
            <circle cx="15" cy="65" r="3" fill="currentColor"/>
            <circle cx="85" cy="65" r="3" fill="currentColor"/>
            <text x="50" y="35" fill="#0a84ff" class="geo-label">弧 AB</text>
        </svg>`,
        category: "circle"
    },
    "arc length": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3"/>
            <path d="M 15,65 A 40,40 0 0 1 85,65" fill="none" stroke="#0a84ff" stroke-width="3"/>
            <text x="50" y="25" fill="#0a84ff" class="geo-small">弧長 = ?</text>
            <path d="M 45,55 L 50,65 L 55,55" fill="none" stroke="#ff9f0a" stroke-width="2"/>
        </svg>`,
        category: "circle"
    },
    "sector": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <path d="M 50,50 L 85,30 A 40,40 0 0 1 85,70 Z" fill="#0a84ff" fill-opacity="0.3" stroke="#0a84ff" stroke-width="2"/>
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3,3"/>
            <circle cx="50" cy="50" r="3" fill="currentColor"/>
            <text x="65" y="55" fill="#0a84ff" class="geo-small">扇形</text>
        </svg>`,
        category: "circle"
    },
    "angle of the sector": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <path d="M 50,50 L 85,30 A 40,40 0 0 1 85,70 Z" fill="#0a84ff" fill-opacity="0.2" stroke="currentColor" stroke-width="1"/>
            <line x1="50" y1="50" x2="85" y2="30" stroke="currentColor" stroke-width="2"/>
            <line x1="50" y1="50" x2="85" y2="70" stroke="currentColor" stroke-width="2"/>
            <path d="M 60,50 A 10,10 0 0 0 58,42" fill="none" stroke="#ff9f0a" stroke-width="2"/>
            <text x="65" y="52" fill="#ff9f0a" class="geo-small">θ</text>
        </svg>`,
        category: "circle"
    },

    // ========== 三角學 ==========
    "cosine": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,85 10,20 90,85" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="10" y="75" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
            <line x1="10" y1="85" x2="90" y2="85" stroke="#30d158" stroke-width="3"/>
            <line x1="10" y1="20" x2="90" y2="85" stroke="#0a84ff" stroke-width="3"/>
            <text x="50" y="55" class="geo-formula">cos θ = 鄰/斜</text>
        </svg>`,
        category: "trigonometry"
    },
    "tangent": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,85 10,20 90,85" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="10" y="75" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
            <line x1="10" y1="20" x2="10" y2="85" stroke="#ff9f0a" stroke-width="3"/>
            <line x1="10" y1="85" x2="90" y2="85" stroke="#30d158" stroke-width="3"/>
            <text x="50" y="55" class="geo-formula">tan θ = 對/鄰</text>
        </svg>`,
        category: "trigonometry"
    },
    "trigonometric ratio": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,85 10,20 90,85" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="10" y="75" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
            <text x="50" y="35" class="geo-tiny">sin = 對/斜</text>
            <text x="50" y="50" class="geo-tiny">cos = 鄰/斜</text>
            <text x="50" y="65" class="geo-tiny">tan = 對/鄰</text>
        </svg>`,
        category: "trigonometry"
    },
    "Pythagoras' theorem": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,85 10,30 70,85" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="10" y="75" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
            <text x="5" y="60" class="geo-tiny">a</text>
            <text x="40" y="95" class="geo-tiny">b</text>
            <text x="45" y="55" class="geo-tiny">c</text>
            <text x="50" y="25" fill="#0a84ff" class="geo-formula">a² + b² = c²</text>
        </svg>`,
        category: "geometry"
    },
    "Pythagorean triple": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,85 10,45 50,85" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="10" y="75" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
            <text x="5" y="68" fill="#ff9f0a" class="geo-small">3</text>
            <text x="25" y="95" fill="#30d158" class="geo-small">4</text>
            <text x="35" y="60" fill="#0a84ff" class="geo-small">5</text>
            <text x="65" y="50" class="geo-tiny">3² + 4² = 5²</text>
            <text x="65" y="65" class="geo-tiny">9 + 16 = 25</text>
        </svg>`,
        category: "geometry"
    },

    // ========== 全等與相似 ==========
    "congruent figures": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,70 30,30 50,70" fill="#0a84ff" fill-opacity="0.3" stroke="#0a84ff" stroke-width="2"/>
            <polygon points="55,70 75,30 95,70" fill="#30d158" fill-opacity="0.3" stroke="#30d158" stroke-width="2"/>
            <text x="50" y="90" class="geo-small">≅ 全等</text>
        </svg>`,
        category: "geometry"
    },
    "similar figures": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <polygon points="10,75 25,40 40,75" fill="#0a84ff" fill-opacity="0.3" stroke="#0a84ff" stroke-width="2"/>
            <polygon points="50,80 75,25 95,80" fill="#30d158" fill-opacity="0.3" stroke="#30d158" stroke-width="2"/>
            <text x="50" y="95" class="geo-small">∼ 相似</text>
        </svg>`,
        category: "geometry"
    },

    // ========== 統計圖表 ==========
    "histogram": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="15" y1="85" x2="95" y2="85" stroke="currentColor" stroke-width="2"/>
            <line x1="15" y1="85" x2="15" y2="15" stroke="currentColor" stroke-width="2"/>
            <rect x="20" y="50" width="15" height="35" fill="#0a84ff" fill-opacity="0.7"/>
            <rect x="35" y="30" width="15" height="55" fill="#0a84ff" fill-opacity="0.7"/>
            <rect x="50" y="45" width="15" height="40" fill="#0a84ff" fill-opacity="0.7"/>
            <rect x="65" y="60" width="15" height="25" fill="#0a84ff" fill-opacity="0.7"/>
            <text x="55" y="20" class="geo-small">直方圖</text>
        </svg>`,
        category: "statistics"
    },
    "frequency polygon": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="15" y1="85" x2="95" y2="85" stroke="currentColor" stroke-width="2"/>
            <line x1="15" y1="85" x2="15" y2="15" stroke="currentColor" stroke-width="2"/>
            <polyline points="20,70 35,40 50,55 65,35 80,60" fill="none" stroke="#0a84ff" stroke-width="2"/>
            <circle cx="20" cy="70" r="3" fill="#0a84ff"/>
            <circle cx="35" cy="40" r="3" fill="#0a84ff"/>
            <circle cx="50" cy="55" r="3" fill="#0a84ff"/>
            <circle cx="65" cy="35" r="3" fill="#0a84ff"/>
            <circle cx="80" cy="60" r="3" fill="#0a84ff"/>
            <text x="50" y="20" class="geo-small">頻率多邊形</text>
        </svg>`,
        category: "statistics"
    },
    "cumulative frequency curve": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="15" y1="85" x2="95" y2="85" stroke="currentColor" stroke-width="2"/>
            <line x1="15" y1="85" x2="15" y2="15" stroke="currentColor" stroke-width="2"/>
            <path d="M 20,80 Q 40,75 50,50 T 85,20" fill="none" stroke="#0a84ff" stroke-width="2"/>
            <text x="45" y="15" class="geo-tiny">累積頻率曲線</text>
        </svg>`,
        category: "statistics"
    },

    // ========== 代數相關 ==========
    "linear equation": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="10" y1="85" x2="90" y2="85" stroke="currentColor" stroke-width="1"/>
            <line x1="50" y1="95" x2="50" y2="15" stroke="currentColor" stroke-width="1"/>
            <line x1="15" y1="75" x2="85" y2="25" stroke="#0a84ff" stroke-width="2"/>
            <text x="50" y="12" class="geo-tiny">y = mx + c</text>
        </svg>`,
        category: "algebra"
    },
    "direct proportion": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <line x1="10" y1="85" x2="90" y2="85" stroke="currentColor" stroke-width="1"/>
            <line x1="15" y1="90" x2="15" y2="15" stroke="currentColor" stroke-width="1"/>
            <line x1="15" y1="85" x2="85" y2="20" stroke="#0a84ff" stroke-width="2"/>
            <text x="50" y="12" class="geo-tiny">y = kx</text>
            <text x="70" y="35" fill="#0a84ff" class="geo-tiny">正比例</text>
        </svg>`,
        category: "algebra"
    },
    "square root": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <text x="50" y="55" text-anchor="middle" class="geo-big">√x</text>
            <text x="50" y="80" class="geo-tiny">例: √16 = 4</text>
        </svg>`,
        category: "number"
    },
    "cube root": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <text x="50" y="55" text-anchor="middle" class="geo-big">∛x</text>
            <text x="50" y="80" class="geo-tiny">例: ∛27 = 3</text>
        </svg>`,
        category: "number"
    },
    "ratio": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <rect x="15" y="40" width="30" height="20" fill="#0a84ff" fill-opacity="0.7"/>
            <rect x="55" y="40" width="20" height="20" fill="#30d158" fill-opacity="0.7"/>
            <text x="50" y="80" text-anchor="middle" class="geo-label">3 : 2</text>
        </svg>`,
        category: "number"
    },
    "standard form": {
        svg: `<svg viewBox="0 0 100 100" class="geo-svg">
            <text x="50" y="45" text-anchor="middle" class="geo-formula">a × 10ⁿ</text>
            <text x="50" y="70" text-anchor="middle" class="geo-tiny">1 ≤ a < 10</text>
        </svg>`,
        category: "number"
    }
};

// ==================== 主類 ====================
class MathWordVault {
    constructor() {
        this.currentGrade = 's2';
        this.currentMode = null;
        this.currentWords = [];
        this.currentIndex = 0;
        this.sessionStats = { correct: 0, wrong: 0 };
        this.userProgress = this.loadProgress();
        this.init();
    }

    init() { this.updateStats(); this.hideSplash(); }

    loadProgress() {
        const saved = localStorage.getItem('mathWordVault_progress');
        return saved ? JSON.parse(saved) : { s1: {}, s2: {}, s3: {}, reviewQueue: [] };
    }

    saveProgress() { localStorage.setItem('mathWordVault_progress', JSON.stringify(this.userProgress)); }

    getWordProgress(term) { return this.userProgress[this.currentGrade][term] || { mastery: 0, lastSeen: null, wrongCount: 0 }; }

    updateWordProgress(term, correct) {
        if (!this.userProgress[this.currentGrade][term]) this.userProgress[this.currentGrade][term] = { mastery: 0, lastSeen: null, wrongCount: 0 };
        const p = this.userProgress[this.currentGrade][term];
        p.lastSeen = Date.now();
        if (correct) { p.mastery = Math.min(5, p.mastery + 1); this.userProgress.reviewQueue = this.userProgress.reviewQueue.filter(w => w !== term); }
        else { p.mastery = Math.max(0, p.mastery - 1); p.wrongCount++; if (!this.userProgress.reviewQueue.includes(term)) this.userProgress.reviewQueue.push(term); }
        this.saveProgress();
    }

    updateStats() {
        const words = MATH_VOCABULARY[this.currentGrade];
        const mastered = words.filter(w => (this.getWordProgress(w.term).mastery || 0) >= 3).length;
        document.getElementById('totalMastered').textContent = mastered;
        document.getElementById('totalWords').textContent = words.length;
        document.getElementById('progressValue').textContent = `${mastered} / ${words.length}`;
        document.getElementById('s2Count').textContent = `${words.length} 個詞彙`;
        document.getElementById('s2Progress').style.width = `${words.length ? (mastered / words.length) * 100 : 0}%`;
        document.getElementById('reviewCount').textContent = this.userProgress.reviewQueue.length;
    }

    selectGrade(grade) {
        if (grade !== 's2') { alert('此年級詞彙即將推出！'); return; }
        this.currentGrade = grade;
        document.querySelectorAll('.grade-card').forEach(c => c.classList.remove('active'));
        document.querySelector(`[data-grade="${grade}"]`).classList.add('active');
        this.updateStats();
    }

    startMode(mode) {
        const words = MATH_VOCABULARY[this.currentGrade];
        if (!words.length) { alert('此年級暫無詞彙數據！'); return; }
        this.currentMode = mode;
        this.sessionStats = { correct: 0, wrong: 0 };
        this.currentIndex = 0;

        switch (mode) {
            case 'learning': this.currentWords = this.shuffle([...words]).slice(0, 10); break;
            case 'flashRecall':
                this.currentWords = this.shuffle([...words].filter(w => this.getWordProgress(w.term).mastery > 0)).slice(0, 15);
                if (!this.currentWords.length) { alert('請先使用「初識卡」學習一些詞彙！'); return; }
                break;
            case 'context': this.currentWords = this.shuffle([...words].filter(w => w.example)).slice(0, 10); break;
            case 'reverse': this.currentWords = this.shuffle([...words]).slice(0, 10); break;
            case 'visual':
                // Visual 模式優先選擇有圖形的詞彙
                const wordsWithVisuals = words.filter(w => GEOMETRY_VISUALS[w.term]);
                this.currentWords = this.shuffle([...wordsWithVisuals]).slice(0, 10);
                if (!this.currentWords.length) {
                    this.currentWords = this.shuffle([...words]).slice(0, 10);
                }
                break;
            case 'dailyReview':
                this.currentWords = words.filter(w => this.userProgress.reviewQueue.includes(w.term));
                if (!this.currentWords.length) { alert('太棒了！目前沒有需要復習的詞彙！'); return; }
                break;
        }
        this.showLearningView();
        this.renderCard();
    }

    showHome() {
        document.getElementById('homeView').style.display = 'block';
        document.getElementById('learningView').style.display = 'none';
        document.getElementById('wordlistView').style.display = 'none';
        document.getElementById('resultView').style.display = 'none';
        this.updateStats();
    }

    showLearningView() {
        document.getElementById('homeView').style.display = 'none';
        document.getElementById('learningView').style.display = 'block';
        document.getElementById('wordlistView').style.display = 'none';
        document.getElementById('resultView').style.display = 'none';
        this.updateProgressBar();
    }

    showResultView() {
        document.getElementById('learningView').style.display = 'none';
        document.getElementById('resultView').style.display = 'block';
        const total = this.sessionStats.correct + this.sessionStats.wrong;
        const acc = total ? Math.round((this.sessionStats.correct / total) * 100) : 0;
        document.getElementById('resultCorrect').textContent = this.sessionStats.correct;
        document.getElementById('resultWrong').textContent = this.sessionStats.wrong;
        document.getElementById('resultAccuracy').textContent = acc + '%';
        document.getElementById('resultIcon').textContent = acc >= 80 ? '🎉' : acc >= 60 ? '👍' : '💪';
        document.getElementById('resultTitle').textContent = acc >= 80 ? '太棒了！' : acc >= 60 ? '做得不錯！' : '繼續加油！';
    }

    exitLearning() { if (confirm('確定要退出嗎？')) this.showHome(); }
    restartMode() { this.startMode(this.currentMode); }

    renderCard() {
        if (this.currentIndex >= this.currentWords.length) { this.showResultView(); return; }
        const word = this.currentWords[this.currentIndex];
        const container = document.getElementById('cardContainer');
        const controls = document.getElementById('cardControls');
        this.updateProgressBar();

        switch (this.currentMode) {
            case 'learning': this.renderLearningCard(word, container, controls); break;
            case 'flashRecall': case 'dailyReview': this.renderFlashCard(word, container, controls); break;
            case 'context': this.renderContextCard(word, container, controls); break;
            case 'reverse': this.renderReverseCard(word, container, controls); break;
            case 'visual': this.renderVisualCard(word, container, controls); break;
        }
    }

    renderLearningCard(word, container, controls) {
        container.innerHTML = `<div class="word-card" id="wordCard" onclick="wordVault.flipCard()">
            <div class="card-front" id="cardFront"><div class="card-term">${word.term}</div><button class="audio-btn" onclick="event.stopPropagation();wordVault.playAudio('${word.term}')">🔊 聽發音</button><div class="flip-hint">點擊卡片查看詳情</div></div>
            <div class="card-back" id="cardBack" style="display:none;"><div class="card-chinese">${word.chinese}</div><div class="card-definition">${word.definition}</div>${word.example ? `<div class="card-example"><span class="label">典型題幹：</span>"${word.example}"</div>` : ''}${word.confusion ? `<div class="card-confusion"><span class="label">⚠️ 常見混淆：</span>${word.confusion}</div>` : ''}</div>
        </div>`;
        controls.innerHTML = `<button class="control-btn primary" onclick="wordVault.nextCard(true)">我理解了 ✔</button>`;
    }

    renderFlashCard(word, container, controls) {
        container.innerHTML = `<div class="word-card"><div class="card-front" id="cardFront"><div class="card-term">${word.term}</div><button class="show-btn" onclick="wordVault.showMeaning()">顯示含義</button></div><div class="card-back" id="cardBack" style="display:none;"><div class="card-chinese">${word.chinese}</div><div class="card-definition">${word.definition}</div></div></div>`;
        controls.innerHTML = `<div id="flashControls" style="display:none;"><button class="control-btn easy" onclick="wordVault.nextCard(true)">😊 簡單</button><button class="control-btn hard" onclick="wordVault.nextCard(false)">😓 困難</button></div>`;
    }

    showMeaning() { document.getElementById('cardFront').style.display = 'none'; document.getElementById('cardBack').style.display = 'block'; document.getElementById('flashControls').style.display = 'flex'; }

    renderContextCard(word, container, controls) {
        const all = MATH_VOCABULARY[this.currentGrade];
        let opts = [word];
        const same = all.filter(w => w.category === word.category && w.term !== word.term);
        const other = all.filter(w => w.category !== word.category);
        while (opts.length < 4 && same.length) opts.push(same.splice(Math.floor(Math.random() * same.length), 1)[0]);
        while (opts.length < 4 && other.length) opts.push(other.splice(Math.floor(Math.random() * other.length), 1)[0]);
        opts = this.shuffle(opts);
        const sentence = word.example.replace(new RegExp(word.term, 'gi'), '_______');
        container.innerHTML = `<div class="word-card context-card"><div class="context-prompt">選擇正確的術語填空：</div><div class="context-sentence">"${sentence}"</div><div class="context-options">${opts.map(o => `<button class="option-btn" data-term="${o.term}" onclick="wordVault.checkContext('${o.term}','${word.term}')">${o.term}</button>`).join('')}</div><div class="feedback" id="feedback" style="display:none;"></div></div>`;
        controls.innerHTML = '';
    }

    checkContext(sel, correct) {
        const btns = document.querySelectorAll('.option-btn');
        const fb = document.getElementById('feedback');
        const ok = sel === correct;
        btns.forEach(b => { b.disabled = true; if (b.dataset.term === correct) b.classList.add('correct'); else if (b.dataset.term === sel && !ok) b.classList.add('wrong'); });
        fb.innerHTML = ok ? `<div class="fb-ok">✔ 正確！</div>` : `<div class="fb-err">✗ 正確答案是 <strong>${correct}</strong></div>`;
        fb.style.display = 'block';
        if (ok) this.sessionStats.correct++; else this.sessionStats.wrong++;
        this.updateWordProgress(correct, ok);
        setTimeout(() => { this.currentIndex++; this.renderCard(); }, ok ? 1000 : 2000);
    }

    renderReverseCard(word, container, controls) {
        const all = MATH_VOCABULARY[this.currentGrade];
        let opts = [word];
        const other = all.filter(w => w.term !== word.term);
        while (opts.length < 4 && other.length) opts.push(other.splice(Math.floor(Math.random() * other.length), 1)[0]);
        opts = this.shuffle(opts);
        container.innerHTML = `<div class="word-card reverse-card"><div class="reverse-prompt">選擇正確的英文術語：</div><div class="reverse-chinese">${word.chinese}</div><div class="reverse-options">${opts.map(o => `<button class="option-btn" data-term="${o.term}" onclick="wordVault.checkReverse('${o.term}','${word.term}')">${o.term}</button>`).join('')}</div><div class="feedback" id="feedback" style="display:none;"></div></div>`;
        controls.innerHTML = '';
    }

    checkReverse(sel, correct) {
        const btns = document.querySelectorAll('.option-btn');
        const fb = document.getElementById('feedback');
        const ok = sel === correct;
        btns.forEach(b => { b.disabled = true; if (b.dataset.term === correct) b.classList.add('correct'); else if (b.dataset.term === sel && !ok) b.classList.add('wrong'); });
        fb.innerHTML = ok ? `<div class="fb-ok">✔ 正確！</div>` : `<div class="fb-err">✗ 正確答案是 <strong>${correct}</strong></div>`;
        fb.style.display = 'block';
        if (ok) this.sessionStats.correct++; else this.sessionStats.wrong++;
        this.updateWordProgress(correct, ok);
        setTimeout(() => { this.currentIndex++; this.renderCard(); }, ok ? 1000 : 2000);
    }

    // ==================== 增強版 Visual Card（顯示真實幾何圖形）====================
    renderVisualCard(word, container, controls) {
        const all = MATH_VOCABULARY[this.currentGrade];

        // 優先選擇有圖形的詞彙
        const wordsWithVisuals = all.filter(w => GEOMETRY_VISUALS[w.term]);

        // 如果當前詞沒有圖形，隨機選一個有圖形的
        let targetWord = word;
        if (!GEOMETRY_VISUALS[word.term] && wordsWithVisuals.length > 0) {
            targetWord = wordsWithVisuals[Math.floor(Math.random() * wordsWithVisuals.length)];
        }

        // 如果完全沒有圖形數據，fallback 到舊版本
        if (!GEOMETRY_VISUALS[targetWord.term]) {
            this.renderVisualCardFallback(word, container, controls);
            return;
        }

        // 生成選項：1個正確 + 2個干擾項（都要有圖形）
        let opts = [targetWord];
        const sameCategory = wordsWithVisuals.filter(w =>
            w.category === targetWord.category &&
            w.term !== targetWord.term
        );
        const otherCategory = wordsWithVisuals.filter(w =>
            w.category !== targetWord.category
        );

        // 優先同類別的干擾項
        while (opts.length < 3 && sameCategory.length) {
            opts.push(sameCategory.splice(Math.floor(Math.random() * sameCategory.length), 1)[0]);
        }
        while (opts.length < 3 && otherCategory.length) {
            opts.push(otherCategory.splice(Math.floor(Math.random() * otherCategory.length), 1)[0]);
        }

        opts = this.shuffle(opts);

        // 渲染：顯示圖形，讓學生選擇對應的術語
        container.innerHTML = `
            <div class="word-card visual-card">
                <div class="visual-prompt">這個圖形代表什麼術語？</div>
                <div class="visual-figure">
                    ${GEOMETRY_VISUALS[targetWord.term].svg}
                </div>
                <div class="visual-options">
                    ${opts.map(o => `
                        <button class="visual-opt" data-term="${o.term}" onclick="wordVault.checkVisual('${o.term}','${targetWord.term}')">
                            <span class="opt-term">${o.term}</span>
                            <span class="opt-zh">${o.chinese}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="feedback" id="feedback" style="display:none;"></div>
            </div>
        `;
        controls.innerHTML = '';
    }

    // 舊版 fallback（無圖形時使用）
    renderVisualCardFallback(word, container, controls) {
        const all = MATH_VOCABULARY[this.currentGrade];
        let opts = [word];
        const other = all.filter(w => w.term !== word.term);
        while (opts.length < 3 && other.length) {
            opts.push(other.splice(Math.floor(Math.random() * other.length), 1)[0]);
        }
        opts = this.shuffle(opts);
        container.innerHTML = `
            <div class="word-card visual-card">
                <div class="visual-prompt">選擇與此術語匹配的選項：</div>
                <div class="visual-term">${word.term}</div>
                <div class="visual-options">
                    ${opts.map(o => `
                        <button class="visual-opt" data-term="${o.term}" onclick="wordVault.checkVisual('${o.term}','${word.term}')">
                            <span class="opt-term">${o.term}</span>
                            <span class="opt-zh">${o.chinese}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="feedback" id="feedback" style="display:none;"></div>
            </div>
        `;
        controls.innerHTML = '';
    }

    checkVisual(sel, correct) {
        const btns = document.querySelectorAll('.visual-opt');
        const fb = document.getElementById('feedback');
        const ok = sel === correct;
        btns.forEach(b => { b.disabled = true; if (b.dataset.term === correct) b.classList.add('correct'); else if (b.dataset.term === sel && !ok) b.classList.add('wrong'); });
        fb.innerHTML = ok ? `<div class="fb-ok">✔ 正確！</div>` : `<div class="fb-err">✗ 請記住正確答案</div>`;
        fb.style.display = 'block';
        if (ok) this.sessionStats.correct++; else this.sessionStats.wrong++;
        this.updateWordProgress(correct, ok);
        setTimeout(() => { this.currentIndex++; this.renderCard(); }, ok ? 1000 : 2000);
    }

    flipCard() {
        const front = document.getElementById('cardFront');
        const back = document.getElementById('cardBack');
        if (front.style.display !== 'none') { front.style.display = 'none'; back.style.display = 'block'; }
        else { front.style.display = 'block'; back.style.display = 'none'; }
    }

    nextCard(correct) {
        const word = this.currentWords[this.currentIndex];
        this.updateWordProgress(word.term, correct);
        if (correct) this.sessionStats.correct++; else this.sessionStats.wrong++;
        this.currentIndex++;
        this.renderCard();
    }

    updateProgressBar() {
        const pct = (this.currentIndex / this.currentWords.length) * 100;
        document.getElementById('learningProgressFill').style.width = pct + '%';
        document.getElementById('currentNum').textContent = this.currentIndex + 1;
        document.getElementById('totalNum').textContent = this.currentWords.length;
    }

    playAudio(term) { const u = new SpeechSynthesisUtterance(term); u.lang = 'en-US'; u.rate = 0.8; speechSynthesis.speak(u); }
    shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

    showWordList() {
        document.getElementById('homeView').style.display = 'none';
        document.getElementById('wordlistView').style.display = 'block';
        document.getElementById('categoryFilter').innerHTML = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
        this.renderWordList();
    }

    renderWordList() {
        const words = MATH_VOCABULARY[this.currentGrade];
        const search = (document.getElementById('wordSearch').value || '').toLowerCase();
        const cat = document.getElementById('categoryFilter').value;
        const mast = document.getElementById('masteryFilter').value;
        const filtered = words.filter(w => {
            if (search && !w.term.toLowerCase().includes(search) && !w.chinese.includes(search)) return false;
            if (cat !== 'all' && w.category !== cat) return false;
            const p = this.getWordProgress(w.term);
            if (mast === 'mastered' && p.mastery < 3) return false;
            if (mast === 'learning' && (p.mastery < 1 || p.mastery >= 3)) return false;
            if (mast === 'new' && p.mastery > 0) return false;
            return true;
        });
        document.getElementById('wordGrid').innerHTML = filtered.length ? filtered.map(w => {
            const p = this.getWordProgress(w.term);
            return `<div class="word-item" onclick="wordVault.showWordDetail('${w.term}')"><div class="word-term">${w.term}</div><div class="word-chinese">${w.chinese}</div><div class="word-mastery"><div class="mastery-bar"><div class="mastery-fill" style="width:${(p.mastery/5)*100}%"></div></div><span>${p.mastery}/5</span></div></div>`;
        }).join('') : '<div class="no-results">沒有找到匹配的詞彙</div>';
    }

    searchWords() { this.renderWordList(); }
    filterByCategory() { this.renderWordList(); }
    filterByMastery() { this.renderWordList(); }

    showWordDetail(term) {
        const w = MATH_VOCABULARY[this.currentGrade].find(x => x.term === term);
        if (!w) return;
        const p = this.getWordProgress(term);
        document.getElementById('wordDetailContent').innerHTML = `<div class="detail-term">${w.term}</div><button class="detail-audio" onclick="wordVault.playAudio('${w.term}')">🔊 聽發音</button><div class="detail-chinese">${w.chinese}</div><div class="detail-def">${w.definition}</div>${w.example ? `<div class="detail-ex"><strong>典型題幹：</strong>"${w.example}"</div>` : ''}${w.confusion ? `<div class="detail-conf"><strong>⚠️ 常見混淆：</strong>${w.confusion}</div>` : ''}<div class="detail-cat"><strong>分類：</strong>${CATEGORIES[w.category]||w.category}</div><div class="detail-mast"><strong>掌握程度：</strong>${p.mastery}/5</div>`;
        document.getElementById('wordDetailModal').style.display = 'flex';
    }

    closeWordDetail() { document.getElementById('wordDetailModal').style.display = 'none'; }
    hideSplash() { setTimeout(() => { const s = document.getElementById('splashScreen'); if (s) { s.classList.add('fade-out'); setTimeout(() => s.style.display = 'none', 600); } }, 1000); }
}

let wordVault;
document.addEventListener('DOMContentLoaded', () => { wordVault = new MathWordVault(); window.wordVault = wordVault; console.log('🎴 Math Word Vault 已載入（含幾何圖形增強）'); });