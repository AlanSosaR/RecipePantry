const parseToDecimal = (str) => {
    if (!str) return null;
    let cleanStr = str.toString().replace(',', '.').trim();
    if (cleanStr.includes(' ') && cleanStr.includes('/')) {
        const parts = cleanStr.split(/\s+/);
        const integerPart = parseFloat(parts[0]);
        const fractionParts = parts[1].split('/');
        if (fractionParts.length === 2) {
            return integerPart + (parseFloat(fractionParts[0]) / parseFloat(fractionParts[1]));
        }
    }
    if (cleanStr.includes('/')) {
        const parts = cleanStr.split('/');
        if (parts.length === 2) {
            return parseFloat(parts[0]) / parseFloat(parts[1]);
        }
    }
    const val = parseFloat(cleanStr);
    return isNaN(val) ? null : val;
};

const formatQuantity = (value) => value.toString();

const scaleText = (text, scale) => {
    if (!text || scale === 1) return text;
    const regex = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+[\.,]\d+|\d+)/g;
    return text.replace(regex, (match, offset, fullString) => {
        const prevChar = offset > 0 ? fullString[offset - 1] : '';
        console.log(`Matching: "${match}", prevChar: "${prevChar}", isValid: ${!(/[a-zA-Z]/.test(prevChar))}`);
        if (/[a-zA-Z]/.test(prevChar)) {
            return match;
        }

        const val = parseToDecimal(match);
        if (val === null) return match;

        const scaled = val * scale;

        if (val >= 10) {
            return Math.round(scaled).toString();
        }
        return formatQuantity(scaled);
    });
};

console.log(scaleText('330g "0" flour', 0.25));
console.log(scaleText('450g water (36°c)', 0.5));
console.log(scaleText('3g yeast', 2));
