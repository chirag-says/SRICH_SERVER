const express = require('express');
const router = express.Router();
const {
    createLeaveRequest,
    getLeaveRequests,
    getLeaveRequest,
    updateLeaveRequest,
    cancelLeaveRequest,
    reviewLeaveRequest,
    getPendingCount
} = require('../controllers/leaveRequest.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/pending-count', authorize('Supervisor', 'Admin'), getPendingCount);

router.route('/')
    .get(getLeaveRequests)
    .post(authorize('Student'), createLeaveRequest);

router.route('/:id')
    .get(getLeaveRequest)
    .put(updateLeaveRequest);

router.put('/:id/cancel', cancelLeaveRequest);
router.put('/:id/review', authorize('Supervisor', 'Admin'), reviewLeaveRequest);

module.exports = router;
