const helpers = {
    formatDate: (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 120) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        }

        if (date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }

        if (days < 30) {
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        }

        if (days < 365) {
            const months = Math.floor(days / 30);
            return `${months} month${months !== 1 ? 's' : ''} ago`;
        }

        const years = Math.floor(days / 365);
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    },
    formatDateFull: (date) => {
        return new Date(date).toLocaleString();
    },
    getHostname: (url) => {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch (e) {
            return '';
        }
    },
    formatTextBlockContent: (text) => {
        if (text == null) return '';
        return String(text).trim()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\r\n/g, '\n')
            .replace(/\n+/g, '\n\n');
    },
    eq: (v1, v2) => v1 === v2,
    gt: (v1, v2) => v1 > v2,
    lt: (v1, v2) => v1 < v2,
    add: (v1, v2) => v1 + v2,
    or: (v1, v2) => v1 || v2,
    slice: (arr, start, end) => {
        if (!arr || !Array.isArray(arr)) return [];
        return arr.slice(start, end);
    },
    length: (arr) => {
        if (!arr) return 0;
        return arr.length;
    },
    reduceDescendantCount: (children) => {
        if (!children) return 0;
        return children.reduce((acc, child) => acc + 1 + (child.descendant_count || 0), 0);
    },
    hoursAgo: (date) => {
        return Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60));
    }
};

module.exports = helpers;
