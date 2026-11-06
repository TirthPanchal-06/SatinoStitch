const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticateAdminToken } = require('../middleware/auth');

router.get('/', categoryController.getCategories);
router.post('/', authenticateAdminToken, categoryController.createCategory);
router.put('/:id', authenticateAdminToken, categoryController.updateCategory);
router.delete('/:id', authenticateAdminToken, categoryController.deleteCategory);

module.exports = router;

