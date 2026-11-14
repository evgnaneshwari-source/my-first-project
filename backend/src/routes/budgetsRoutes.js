const express = require('express');
const router = express.Router();
const {
  getBudgetByMonth,
  createBudget,
  updateBudget,
} = require('../controllers/budgetsController');

router.get('/:year/:month', getBudgetByMonth);
router.post('/', createBudget);
router.put('/:id', updateBudget);

module.exports = router;
