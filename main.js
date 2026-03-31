// SOCIAL BOST – main.js
// Shared utilities & state management via localStorage

const SB = {
  // Save platform selection
  setPlatform(platform) {
    localStorage.setItem('sb_platform', platform);
  },
  // Save package selection
  setPackage(followers, price) {
    localStorage.setItem('sb_followers', followers);
    localStorage.setItem('sb_price', price);
  },
  // Get all state
  getState() {
    return {
      platform:  localStorage.getItem('sb_platform')  || 'instagram',
      followers: localStorage.getItem('sb_followers') || '1000',
      price:     localStorage.getItem('sb_price')     || '1.99',
      username:  localStorage.getItem('sb_username')  || '',
      orderId:   localStorage.getItem('sb_order_id')  || '',
      date:      localStorage.getItem('sb_date')      || '',
    };
  },
  // Clear order state (but keep platform pref)
  clearOrder() {
    ['sb_followers','sb_price','sb_username','sb_order_id','sb_date'].forEach(k => localStorage.removeItem(k));
  }
};

// Make globally accessible
window.SB = SB;
