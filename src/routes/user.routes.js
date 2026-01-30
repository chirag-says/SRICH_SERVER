const express = require('express');
const router = express.Router();
const {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    getMyStudents,
    assignSupervisor,
    updateHours,
    updateProfile,
    changePassword
} = require('../controllers/user.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

// Profile routes (must be before /:id routes)
router.put('/profile', updateProfile);
router.put('/change-password', changePassword);

router.route('/')
    .get(authorize('Admin', 'Supervisor'), getUsers)
    .post(authorize('Admin'), createUser);

router.get('/my-students', authorize('Supervisor'), getMyStudents);

router.route('/:id')
    .get(getUser)
    .put(authorize('Admin'), updateUser)
    .delete(authorize('Admin'), deleteUser);

router.put('/:id/assign-supervisor', authorize('Admin'), assignSupervisor);
router.put('/:id/update-hours', authorize('Admin', 'Supervisor'), updateHours);

module.exports = router;
