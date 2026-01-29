const express = require('express');
const router = express.Router();
const {
    checkIn,
    checkOut,
    getAttendance,
    getTodayStatus,
    verifyAttendance,
    getMonthlySummary
} = require('../controllers/attendance.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

router.post('/check-in', authorize('Student'), checkIn);
router.put('/check-out', authorize('Student'), checkOut);
router.get('/today', getTodayStatus);
router.get('/monthly-summary', getMonthlySummary);
router.get('/', getAttendance);
router.put('/:id/verify', authorize('Supervisor', 'Admin'), verifyAttendance);

module.exports = router;
