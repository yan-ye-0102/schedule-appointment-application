const Appointment = require('../models/appointment');
const { Op } = require('sequelize');
const crypto = require('crypto');
const cache = require('../utils/cache');

// Get all appointments with pagination
const getAppointments = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            sortBy = 'startTime',
            order = 'DESC',
            startDate,
            endDate
        } = req.query;

        const where = {};
        if (startDate) {
            where.startTime = {
                [Op.gte]: new Date(startDate)
            };
        }
        if (endDate) {
            where.endTime = {
                [Op.lte]: new Date(endDate)
            };
        }

        const { count, rows: appointments } = await Appointment.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit),
            order: [[sortBy, order]]
        });

        // Calculate total pages
        const totalPages = Math.ceil(count / limit);
        
        // Generate pagination links only if there's data
        const baseUrl = `${req.protocol}://${req.get('host')}/appointments`;
        const links = {
            self: `${baseUrl}?page=${page}&limit=${limit}`
        };
        
        if (totalPages > 0) {
            links.first = `${baseUrl}?page=1&limit=${limit}`;
            links.last = `${baseUrl}?page=${totalPages}&limit=${limit}`;
            
            if (page > 1) {
                links.prev = `${baseUrl}?page=${page-1}&limit=${limit}`;
            }
            if (page < totalPages) {
                links.next = `${baseUrl}?page=${page+1}&limit=${limit}`;
            }
        }

        // Set Link header
        res.links(links);

        // Send response
        res.json({
            data: appointments,
            pagination: {
                total: count,
                page,
                limit,
                totalPages
            },
            _links: links
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get an appointment by its id
const getAppointmentById = async (req, res) => {
    try {
        const appointment = await Appointment.findByPk(req.params.id);
        if (appointment) {
            // Generate the base URL for our API
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            
            // Add _links section to the appointment response
            appointment.dataValues._links = {
                // Link to this appointment
                self: {
                    href: `${baseUrl}/appointments/${appointment.id}`,
                    method: 'GET'
                },
                // Link to related schedule
                schedule: {
                    href: `${baseUrl}/schedules/${appointment.scheduleId}`,
                    method: 'GET'
                },
                // Link to related user
                user: {
                    href: `${baseUrl}/users/${appointment.userId}`,
                    method: 'GET'
                },
                // Link to all appointments
                collection: {
                    href: `${baseUrl}/appointments`,
                    method: 'GET'
                },
                // Available actions
                update: {
                    href: `${baseUrl}/appointments/${appointment.id}`,
                    method: 'PUT'
                },
                delete: {
                    href: `${baseUrl}/appointments/${appointment.id}`,
                    method: 'DELETE'
                }
            };
            
            res.json(appointment);
        } else {
            res.status(404).json({ 
                message: 'Appointment not found',
                _links: {
                    collection: {
                        href: `${baseUrl}/appointments`,
                        method: 'GET'
                    }
                }
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Create a new appointment
const createAppointment = async (req, res) => {
    try {
        const newAppointment = await Appointment.create(req.body);
        
        // Generate the URL for the newly created resource
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const resourceUrl = `${baseUrl}/appointments/${newAppointment.id}`;
        
        // Set the Location header
        res.setHeader('Location', resourceUrl);
        
        // Return 201 status with the created resource
        res.status(201).json(newAppointment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Update appointment details
const updateAppointment = async (req, res) => {
    try {
        const appointment = await Appointment.findByPk(req.params.id);
        if (appointment) {
            await appointment.update(req.body);
            res.json(appointment);
        } else {
            res.status(404).json({ message: 'Appointment not found' });
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Delete an appointment
const deleteAppointment = async (req, res) => {
    try {
        const appointment = await Appointment.findByPk(req.params.id);
        if (appointment) {
            await appointment.destroy();
            res.json({ message: 'Appointment deleted' });
        } else {
            res.status(404).json({ message: 'Appointment not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all appointments for a student
const getAppointmentsByUserId = async (req, res) => {
    const { userId } = req.params;
    try {
        const appointments = await Appointment.findAll({
            where: { userId }
        });
        res.json(appointments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Delete all appointments for a student (e.g., student account deleted or transferred/graduated)
const deleteAppointmentsByUserId = async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await Appointment.destroy({
            where: { userId }
        });
        res.json({ message: `${result} appointments made by student ${userId} canceled.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all appointments for a schedule
const getAppointmentsByScheduleId = async (req, res) => {
    const { scheduleId } = req.params;
    try {
        const appointments = await Appointment.findAll({
            where: { scheduleId }
        });
        res.json(appointments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const bulkUpdateAppointments = async (req, res) => {
    const { appointments } = req.body;
    const jobId = Date.now().toString();
    
    // Send immediate response
    res.status(202).json({
        message: 'Update job accepted',
        statusUrl: `/appointments/jobs/${jobId}`
    });

    // Process updates asynchronously
    process.nextTick(async () => {
        try {
            // Perform bulk updates
            for (const appt of appointments) {
                await Appointment.update(appt, {
                    where: { id: appt.id }
                });
            }
            // Store job result
            await cache.set(jobId, { status: 'completed' });
        } catch (error) {
            await cache.set(jobId, { 
                status: 'failed', 
                error: error.message 
            });
        }
    });
};

const errorHandler = (err, req, res, next) => {
    if (err.name === 'SequelizeValidationError') {
        return res.status(400).json({
            status: 'error',
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: err.errors.map(e => ({
                field: e.path,
                message: e.message
            }))
        });
    }

    if (err.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
            status: 'error',
            code: 'CONFLICT',
            message: 'Resource already exists'
        });
    }

    // Default error
    res.status(500).json({
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
    });
};

const updateAppointmentAsync = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const appointment = await Appointment.findByPk(appointmentId);
        
        if (!appointment) {
            return res.status(404).json({ message: 'Appointment not found' });
        }

        // Generate a unique operation ID
        const operationId = crypto.randomUUID();
        
        // Create status URL where client can check progress
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const statusUrl = `${baseUrl}/operations/${operationId}`;

        // Store the operation details in cache
        await cache.set(operationId, {
            status: 'processing',
            resourceType: 'appointment',
            resourceId: appointmentId,
            operation: 'update',
            data: req.body
        });

        // Process the update asynchronously
        processAppointmentUpdate(operationId, appointment, req.body).catch(console.error);

        // Return 202 with the status URL
        res.status(202)
           .setHeader('Location', statusUrl)
           .json({
               message: 'Update request accepted',
               statusUrl: statusUrl,
               operationId: operationId
           });

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Async processing function
async function processAppointmentUpdate(operationId, appointment, updateData) {
    try {
        // Simulate long-running task
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Perform the update
        await appointment.update(updateData);

        // Update operation status to complete
        await cache.set(operationId, {
            status: 'completed',
            resourceType: 'appointment',
            resourceId: appointment.id,
            operation: 'update',
            result: appointment
        });
    } catch (error) {
        // Update operation status to failed
        await cache.set(operationId, {
            status: 'failed',
            resourceType: 'appointment',
            resourceId: appointment.id,
            operation: 'update',
            error: error.message
        });
    }
}

module.exports = {
    getAppointments,
    getAppointmentById,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    getAppointmentsByUserId,
    deleteAppointmentsByUserId,
    getAppointmentsByScheduleId,
    updateAppointmentAsync
};
