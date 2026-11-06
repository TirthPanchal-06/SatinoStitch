const { query } = require('../config/db');

async function logCustomerActivity({ userId = null, userName = null, activityType, description, metadata = {} }) {
  try {
    const sql = `
      INSERT INTO customer_activities (user_id, user_name, activity_type, description, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const res = await query(sql, [
      userId,
      userName || 'Anonymous Visitor',
      activityType,
      description,
      JSON.stringify(metadata)
    ]);
    return res.rows[0];
  } catch (err) {
    console.warn('[Activity Logger] Failed to log activity:', err.message);
    return null;
  }
}

async function getCustomerActivities(limit = 30, type = null) {
  let sql = `
    SELECT * FROM customer_activities
    WHERE 1=1
  `;
  const params = [];
  if (type) {
    sql += ` AND activity_type = $1`;
    params.push(type);
  }
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1};`;
  params.push(limit);

  const res = await query(sql, params);
  return res.rows;
}

module.exports = {
  logCustomerActivity,
  getCustomerActivities
};

