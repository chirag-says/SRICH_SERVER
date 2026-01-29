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
    updateHours
} = require('../controllers/user.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

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
