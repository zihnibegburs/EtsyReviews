const SubscriptionHelper = {
    hasProAccess(subscription) {
        if (!subscription) return false;
        const status = subscription.status;
        if (status === 'ACTIVE' || status === 'TRIAL' || status === 'PAST_DUE') {
            return true;
        }
        return this.isInCancelGracePeriod(subscription);
    },

    isInCancelGracePeriod(subscription) {
        if (!subscription?.cancelAtPeriodEnd && !subscription?.cancelledAt) {
            return false;
        }
        if (!subscription.currentPeriodEnd) {
            return false;
        }
        return new Date(subscription.currentPeriodEnd) > new Date();
    },

    isPendingCancel(subscription) {
        if (!subscription) return false;
        if (!subscription.cancelAtPeriodEnd && !subscription.cancelledAt) {
            return false;
        }
        return this.hasProAccess(subscription);
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.SubscriptionHelper = SubscriptionHelper;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubscriptionHelper;
}
