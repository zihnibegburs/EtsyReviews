const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'is', 'it', 'its', 'this', 'that', 'was', 'were', 'are', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'can', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they',
    'them', 'their', 'his', 'her', 'not', 'no', 'so', 'if', 'as', 'just', 'very', 'too',
    'also', 'than', 'then', 'when', 'what', 'which', 'who', 'how', 'all', 'any', 'some',
    'more', 'most', 'other', 'into', 'over', 'such', 'only', 'own', 'same', 'am', 'im',
    've', 'll', 're', 'don', 'didn', 'doesn', 'wasn', 'weren', 'isn', 'aren', 'been',
    'about', 'up', 'out', 'get', 'got', 'one', 'two', 'really', 'love', 'loved', 'like',
    'liked', 'great', 'good', 'nice', 'item', 'product', 'purchase', 'purchased', 'buy',
    'bought', 'order', 'ordered', 'shop', 'seller', 'etsy', 'review', 'reviews'
]);

function parseReviewDate(dateStr) {
    if (!dateStr) return null;

    const dotted = String(dateStr).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotted) {
        const [, day, month, year] = dotted;
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? null : date;
}

function countWords(text) {
    if (!text?.trim()) return 0;
    return text.trim().split(/\s+/).length;
}

function computeReviewStats(reviews) {
    const total = reviews.length;
    if (!total) {
        return {
            total: 0,
            averageRating: null,
            positiveRate: null,
            recommendRate: null,
            withTextRate: null,
            withPhotoRate: null,
            averageWordCount: null,
            ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        };
    }

    let ratingSum = 0;
    let ratedCount = 0;
    let positiveCount = 0;
    let recommendYes = 0;
    let recommendTotal = 0;
    let withText = 0;
    let withPhoto = 0;
    let wordCountSum = 0;
    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    reviews.forEach((review) => {
        const rating = Number(review.rating) || 0;
        if (rating > 0) {
            ratingSum += rating;
            ratedCount += 1;
            if (rating >= 4) positiveCount += 1;
            if (ratingDistribution[rating] != null) {
                ratingDistribution[rating] += 1;
            }
        }

        if (review.isRecommended === true) {
            recommendYes += 1;
            recommendTotal += 1;
        } else if (review.isRecommended === false) {
            recommendTotal += 1;
        }

        if (review.text?.trim()) {
            withText += 1;
            wordCountSum += countWords(review.text);
        }

        if (review.photoUrl || review.appreciationPhotoUrl) {
            withPhoto += 1;
        }
    });

    return {
        total,
        averageRating: ratedCount ? ratingSum / ratedCount : null,
        positiveRate: ratedCount ? (positiveCount / ratedCount) * 100 : null,
        recommendRate: recommendTotal ? (recommendYes / recommendTotal) * 100 : null,
        withTextRate: (withText / total) * 100,
        withPhotoRate: (withPhoto / total) * 100,
        averageWordCount: withText ? wordCountSum / withText : null,
        ratingDistribution
    };
}

function getReviewsByMonth(reviews) {
    const buckets = new Map();

    reviews.forEach((review) => {
        const date = parseReviewDate(review.date);
        if (!date) return;

        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
    });

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count }));
}

function getTopKeywords(reviews, limit = 12) {
    const counts = new Map();

    reviews.forEach((review) => {
        const words = String(review.text || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s'-]/g, ' ')
            .split(/\s+/)
            .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));

        words.forEach((word) => {
            counts.set(word, (counts.get(word) || 0) + 1);
        });
    });

    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([word, count]) => ({ word, count }));
}

if (typeof globalThis !== 'undefined') {
    globalThis.computeReviewStats = computeReviewStats;
    globalThis.getReviewsByMonth = getReviewsByMonth;
    globalThis.getTopKeywords = getTopKeywords;
}
