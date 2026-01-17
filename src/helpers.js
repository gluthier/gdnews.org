
const isUserAdmin = (user) => {
    return user && user.user_type === 'admin';
}
const isUserOwner = (user, post) => {
    return user && user.id === post.user_id;
}

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
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        }

        if (hours < 24) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }

        if (days < 30) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        }

        if (days < 365) {
            const months = Math.floor(days / 30);
            return `${months} month${months > 1 ? 's' : ''} ago`;
        }

        const years = Math.floor(days / 365);
        return `${years} year${years > 1 ? 's' : ''} ago`;
    },
    formatDateFull: (date) => {
        return new Date(date).toLocaleString("en-GB");
    },
    formatDatePromotedPost: (date) => {
        return new Date(date).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
    },
    getHostname: (url) => {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch (e) {
            return '';
        }
    },
    formatTextBlockContent: (description) => {
        if (description == null) return '';
        return String(description).trim()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\r\n/g, '\n')
            .replace(/\n+/g, '\n\n');
    },
    eq: (v1, v2) => v1 === v2,
    neq: (v1, v2) => v1 !== v2,
    gt: (v1, v2) => v1 > v2,
    lt: (v1, v2) => v1 < v2,
    add: (v1, v2) => v1 + v2,
    and: (...args) => {
        // Remove the last argument (Handlebars options object)
        args.pop();
        return args.every(val => !!val);
    },
    or: (v1, v2) => v1 || v2,
    not: (value) => !value,
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
    },
    formatCommentCount: (count) => {
        const numCount = Number(count);
        if (!numCount || numCount === 0) {
            return 'discuss';
        }
        if (numCount === 1) {
            return '1 comment';
        }
        return `${numCount} comments`;
    },
    assetUrl: (url) => {
        if (process.env.NODE_ENV === 'production') {
            const parts = url.split('.');
            const ext = parts.pop();
            return parts.join('.') + '.min.' + ext;
        }
        return url;
    },
    isToday: (dateString) => {
        const date = new Date(dateString);
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    },
    canUserLockPost: (post, user, isDetail) => {
        return (isDetail && isUserAdmin(user));
    },
    canUserModifyPost: (post, user, isDetail) => {
        return (isDetail && isUserAdmin(user));
    },
    canUserRemoveJob: (post, user, isDetail) => {
        return (isDetail && post.is_job && (isUserAdmin(user) || isUserOwner(user, post)));
    },
    canUserRemovePost: (post, user, isDetail) => {
        return (isDetail && !post.is_job && !post.is_promoted && (isUserAdmin(user) || isUserOwner(user, post)));
    },
    canUserRemovePromotedPost: (post, user, isDetail) => {
        return (isDetail && post.is_promoted && isUserOwner(user, post));
    },
    isAdmin: (user) => {
        return isUserAdmin(user);
    },
    isAdminNotOwner: (user, post) => {
        return isUserAdmin(user) && !isUserOwner(user, post);
    },
    canUserRemoveComment: (comment, user) => {
        return user && (isUserAdmin(user) || comment.user_id === user.id);
    },
    isPostSeparator: (index) => {
        return (index + 1) % 5 === 0 && index < 29;
    }
};

module.exports = helpers;
