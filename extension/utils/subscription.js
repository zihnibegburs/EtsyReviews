const SubscriptionHelper = {
    hasProAccess(subscription) {
        if (!subscription) return false;
        const status = subscription.status;
        return status === 'ACTIVE' || status === 'TRIAL' || status === 'PAST_DUE';
    },

    isPendingCancel(subscription) {
        if (!this.hasProAccess(subscription)) return false;
        return !!subscription.cancelAtPeriodEnd || !!subscription.cancelledAt;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubscriptionHelper;
}
