const express = require('express');
const router = express.Router();
const {
    createCase,
    getCases,
    getCase,
    updateCase,
    deleteCase,
    reviewCase,
    getEnums
} = require('../controllers/clinicalCase.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/enums', getEnums);

router.route('/')
    .get(getCases)
    .post(authorize('Student'), createCase);

router.route('/:id')
    .get(getCase)
    .put(updateCase)
    .delete(authorize('Admin'), deleteCase);

router.put('/:id/review', authorize('Supervisor', 'Admin'), reviewCase);

module.exports = router;
