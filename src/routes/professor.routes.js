const express = require('express');
const router = express.Router();
const {
    getProfessorDashboard,
    getAllStudents,
    getStudentDetails,
    getPendingItems,
    reviewClinicalCase,
    bulkReviewCases,
    getFilterOptions,
    getProgressAnalytics
} = require('../controllers/professor.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

// All routes require authentication and Supervisor/Admin role
router.use(protect);
router.use(authorize('Supervisor', 'Admin'));

// Dashboard
router.get('/dashboard', getProfessorDashboard);

// Students
router.get('/students', getAllStudents);
router.get('/students/:id', getStudentDetails);

// Pending items (cases and leave requests)
router.get('/pending', getPendingItems);

// Clinical case review
router.put('/cases/:id/review', reviewClinicalCase);
router.put('/cases/bulk-review', bulkReviewCases);

// Filter options
router.get('/filters', getFilterOptions);

// Analytics
router.get('/analytics/progress', getProgressAnalytics);

module.exports = router;
