/**
 * SATINOSTITCH Database Gateway & Model Aggregator
 * Provides unified access to all models and database pool.
 */
const { pool, query, testConnection } = require('./config/db');
const productModel = require('./models/productModel');
const categoryModel = require('./models/categoryModel');
const userModel = require('./models/userModel');
const orderModel = require('./models/orderModel');
const cartModel = require('./models/cartModel');
const wishlistModel = require('./models/wishlistModel');
const couponModel = require('./models/couponModel');
const activityModel = require('./models/activityModel');
const analyticsModel = require('./models/analyticsModel');

module.exports = {
  // Pool & Raw Query
  pool,
  query,
  testConnection,

  // Products
  mapProductRow: productModel.mapProductRow,
  getProducts: productModel.getProducts,
  getProductById: productModel.getProductById,
  createProduct: productModel.createProduct,
  updateProduct: productModel.updateProduct,
  deleteProduct: productModel.deleteProduct,
  updateProductStock: productModel.updateProductStock,
  setProductStock: productModel.setProductStock,
  getTypes: productModel.getTypes,
  getProductReviews: productModel.getProductReviews,
  createProductReview: productModel.createProductReview,
  recordProductView: productModel.recordProductView,
  getInventorySummary: productModel.getInventorySummary,

  // Categories
  getCategories: categoryModel.getCategories,
  createCategory: categoryModel.createCategory,
  updateCategory: categoryModel.updateCategory,
  deleteCategory: categoryModel.deleteCategory,

  // Users & Auth
  createUser: userModel.createUser,
  getUserByEmail: userModel.getUserByEmail,
  getUserById: userModel.getUserById,
  updateUserProfile: userModel.updateUserProfile,
  updateUserPassword: userModel.updateUserPassword,
  getAllUsers: userModel.getAllUsers,
  updateUserRole: userModel.updateUserRole,

  // User Addresses
  getUserAddresses: userModel.getUserAddresses,
  createUserAddress: userModel.createUserAddress,
  deleteUserAddress: userModel.deleteUserAddress,

  // Orders
  createOrder: orderModel.createOrder,
  getOrderById: orderModel.getOrderById,
  getUserOrders: orderModel.getUserOrders,
  getAllOrders: orderModel.getAllOrders,
  updateOrderStatus: orderModel.updateOrderStatus,
  updateOrderPaymentStatus: orderModel.updateOrderPaymentStatus,

  // Cart
  getUserCart: cartModel.getUserCart,
  addToUserCart: cartModel.addToUserCart,
  updateCartItemQuantity: cartModel.updateCartItemQuantity,
  removeCartItem: cartModel.removeCartItem,
  clearUserCart: cartModel.clearUserCart,
  syncUserCart: cartModel.syncUserCart,

  // Wishlist
  getUserWishlist: wishlistModel.getUserWishlist,
  addToWishlist: wishlistModel.addToWishlist,
  removeFromWishlist: wishlistModel.removeFromWishlist,

  // Coupons
  getCouponByCode: couponModel.getCouponByCode,
  getAllCoupons: couponModel.getAllCoupons,
  createCoupon: couponModel.createCoupon,
  updateCoupon: couponModel.updateCoupon,
  deleteCoupon: couponModel.deleteCoupon,

  // Activities & Analytics
  logCustomerActivity: activityModel.logCustomerActivity,
  getCustomerActivities: activityModel.getCustomerActivities,
  getAdminAnalytics: analyticsModel.getAdminAnalytics
};
