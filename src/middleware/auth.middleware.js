const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route'
        });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from token
        req.user = await User.findById(decoded.id);

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User no longer exists'
            });
        }

        if (!req.user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'User account is deactivated'
            });
        }

        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route'
        });
    }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `User role '${req.user.role}' is not authorized to access this route`
            });
        }
        next();
    };
};

// Check if user owns the resource or is admin/supervisor
exports.checkOwnership = (model, paramName = 'id') => {
    return async (req, res, next) => {
        try {
            const resource = await model.findById(req.params[paramName]);

            if (!resource) {
                return res.status(404).json({
                    success: false,
                    message: 'Resource not found'
                });
            }

            // Check if user owns the resource or is admin/supervisor
            const isOwner = resource.student?.toString() === req.user._id.toString() ||
                resource.createdBy?.toString() === req.user._id.toString();
            const isAdminOrSupervisor = ['Admin', 'Supervisor'].includes(req.user.role);

            if (!isOwner && !isAdminOrSupervisor) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to access this resource'
                });
            }

            req.resource = resource;
            next();
        } catch (err) {
            return res.status(500).json({
                success: false,
                message: 'Error checking resource ownership'
            });
        }
    };
};
