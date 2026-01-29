const express = require('express');
const router = express.Router();
const {
    getWeeklyStatistics,
    getDashboardStats,
    getMonthlyReport
} = require('../controllers/statistics.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/weekly', getWeeklyStatistics);
router.get('/dashboard', getDashboardStats);
router.get('/monthly', getMonthlyReport);

module.exports = router;
