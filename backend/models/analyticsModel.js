const { query } = require('../config/db');

async function getAdminAnalytics() {
  // 1. Core KPIs
  const kpiRes = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM orders) AS total_orders,
      (SELECT COUNT(*)::int FROM orders WHERE status = 'Confirmed') AS pending_orders,
      (SELECT COUNT(*)::int FROM orders WHERE status = 'Delivered') AS completed_orders,
      (SELECT COUNT(*)::int FROM orders WHERE status = 'Cancelled') AS cancelled_orders,
      (SELECT COUNT(*)::int FROM orders WHERE status = 'Returned') AS returned_orders,
      (SELECT COALESCE(SUM(total), 0)::numeric FROM orders WHERE status != 'Cancelled') AS total_revenue,
      (SELECT COALESCE(SUM(total), 0)::numeric FROM orders WHERE created_at >= NOW() - INTERVAL '30 days' AND status != 'Cancelled') AS monthly_revenue,
      (SELECT COALESCE(SUM(total), 0)::numeric FROM orders WHERE created_at >= NOW() - INTERVAL '7 days' AND status != 'Cancelled') AS weekly_revenue,
      (SELECT COALESCE(SUM(total), 0)::numeric FROM orders WHERE created_at >= CURRENT_DATE AND status != 'Cancelled') AS today_revenue,
      (SELECT COUNT(*)::int FROM users WHERE role = 'customer') AS total_customers,
      (SELECT COUNT(*)::int FROM products) AS total_products,
      (SELECT COUNT(*)::int FROM products WHERE stock = 0) AS out_of_stock,
      (SELECT COUNT(*)::int FROM products WHERE stock > 0 AND stock <= 3) AS low_stock,
      (SELECT COALESCE(SUM(stock), 0)::int FROM products) AS total_inventory_units,
      (SELECT COALESCE(SUM(views_count), 0)::int FROM products) AS total_views
  ;`);
  const kpis = kpiRes.rows[0];

  // 2. Daily Sales Trend (Past 14 Days)
  const dailySalesRes = await query(`
    SELECT 
      TO_CHAR(d.day, 'Mon DD') AS label,
      TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
      COALESCE(COUNT(o.id), 0)::int AS orders,
      COALESCE(SUM(o.total), 0)::numeric AS revenue
    FROM (
      SELECT GENERATE_SERIES(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, '1 day'::interval)::date AS day
    ) d
    LEFT JOIN orders o ON o.created_at::date = d.day AND o.status != 'Cancelled'
    GROUP BY d.day
    ORDER BY d.day ASC;
  `);

  // 3. Weekly Sales Trend (Past 8 Weeks)
  const weeklySalesRes = await query(`
    SELECT 
      'W' || TO_CHAR(DATE_TRUNC('week', d.week), 'IW (Mon DD)') AS label,
      COALESCE(COUNT(o.id), 0)::int AS orders,
      COALESCE(SUM(o.total), 0)::numeric AS revenue
    FROM (
      SELECT GENERATE_SERIES(DATE_TRUNC('week', CURRENT_DATE - INTERVAL '7 weeks'), DATE_TRUNC('week', CURRENT_DATE), '1 week'::interval)::date AS week
    ) d
    LEFT JOIN orders o ON DATE_TRUNC('week', o.created_at) = d.week AND o.status != 'Cancelled'
    GROUP BY d.week
    ORDER BY d.week ASC;
  `);

  // 4. Monthly Sales Trend (Past 6 Months)
  const monthlySalesRes = await query(`
    SELECT 
      TO_CHAR(d.month, 'Mon YYYY') AS label,
      COALESCE(COUNT(o.id), 0)::int AS orders,
      COALESCE(SUM(o.total), 0)::numeric AS revenue
    FROM (
      SELECT GENERATE_SERIES(DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months'), DATE_TRUNC('month', CURRENT_DATE), '1 month'::interval)::date AS month
    ) d
    LEFT JOIN orders o ON DATE_TRUNC('month', o.created_at) = d.month AND o.status != 'Cancelled'
    GROUP BY d.month
    ORDER BY d.month ASC;
  `);

  // 5. Best-Selling Products
  const bestSellersRes = await query(`
    SELECT 
      oi.product_id AS id,
      oi.product_name AS name,
      oi.image,
      SUM(oi.quantity)::int AS units_sold,
      SUM(oi.total)::numeric AS gross_revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'Cancelled' AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id, oi.product_name, oi.image
    ORDER BY units_sold DESC
    LIMIT 6;
  `);

  // 6. Most Viewed Products (Live Demand)
  const mostViewedRes = await query(`
    SELECT 
      p.id, p.name, p.cat, p.price, p.stock, p.image,
      p.views_count,
      COUNT(pv.id)::int AS recent_views
    FROM products p
    LEFT JOIN product_views pv ON pv.product_id = p.id AND pv.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY p.id
    ORDER BY p.views_count DESC
    LIMIT 6;
  `);

  // 7. Recent Orders
  const recentOrdersRes = await query(`
    SELECT 
      id, customer_name, customer_email, total, payment_method, payment_status, status, created_at
    FROM orders
    ORDER BY created_at DESC
    LIMIT 8;
  `);

  // 8. Low Stock Alerts
  const lowStockRes = await query(`
    SELECT id, name, cat, type, stock, price, image
    FROM products
    WHERE stock <= 3
    ORDER BY stock ASC
    LIMIT 6;
  `);

  // 9. Payment Methods Breakdown
  const paymentBreakdownRes = await query(`
    SELECT 
      payment_method,
      COUNT(*)::int AS count,
      COALESCE(SUM(total), 0)::numeric AS volume
    FROM orders
    GROUP BY payment_method
    ORDER BY count DESC;
  `);

  // 10. Demand By Category
  const demandCategoryRes = await query(`
    SELECT 
      c.slug AS category,
      c.name AS label,
      COALESCE(SUM(oi.quantity), 0)::int AS total_units_sold,
      COALESCE(SUM(oi.total), 0)::numeric AS total_revenue,
      COALESCE((SELECT SUM(p.views_count) FROM products p WHERE p.cat = c.slug), 0)::int AS total_views
    FROM categories c
    LEFT JOIN products p ON p.cat = c.slug
    LEFT JOIN order_items oi ON oi.product_id = p.id
    GROUP BY c.slug, c.name
    ORDER BY total_units_sold DESC;
  `);

  // 11. Recent Customer Activities
  const recentActivitiesRes = await query(`
    SELECT id, user_id, user_name, activity_type, description, metadata, created_at
    FROM customer_activities
    ORDER BY created_at DESC
    LIMIT 15;
  `);

  const totalRevenue = Number(kpis.total_revenue) || 0;
  const totalOrders = kpis.total_orders || 0;
  const totalCustomers = kpis.total_customers || 0;
  const totalProducts = kpis.total_products || 0;
  const totalStock = kpis.total_inventory_units || 0;
  const lowStock = kpis.low_stock || 0;
  const totalViews = kpis.total_views || 0;
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const kpiObject = {
    totalRevenue,
    grossRevenue: totalRevenue,
    netRevenue: totalRevenue,
    totalOrders,
    validOrdersCount: totalOrders,
    averageOrderValue,
    aov: averageOrderValue,
    totalCustomers,
    totalProducts,
    totalStock,
    totalInventoryUnits: totalStock,
    lowStock,
    lowStockCount: lowStock,
    outOfStock: kpis.out_of_stock || 0,
    totalViews,
    pendingOrders: kpis.pending_orders || 0,
    completedOrders: kpis.completed_orders || 0,
    cancelledOrders: kpis.cancelled_orders || 0,
    returnedOrders: kpis.returned_orders || 0,
    monthlyRevenue: Number(kpis.monthly_revenue) || 0,
    weeklyRevenue: Number(kpis.weekly_revenue) || 0,
    todayRevenue: Number(kpis.today_revenue) || 0
  };

  const chartObject = {
    daily: dailySalesRes.rows,
    weekly: weeklySalesRes.rows,
    monthly: monthlySalesRes.rows
  };

  return {
    kpis: kpiObject,
    summary: kpiObject,
    charts: chartObject,
    salesGraphs: chartObject,
    bestSellers: bestSellersRes.rows,
    mostViewed: mostViewedRes.rows,
    recentOrders: recentOrdersRes.rows,
    lowStockAlerts: lowStockRes.rows,
    paymentBreakdown: paymentBreakdownRes.rows,
    demandByCategory: demandCategoryRes.rows,
    recentActivities: recentActivitiesRes.rows
  };
}

module.exports = {
  getAdminAnalytics
};
