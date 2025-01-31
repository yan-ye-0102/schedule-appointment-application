const express = require('express');
const cors = require('cors');
const app = express();
const scheduleService = require('./services/scheduleService');
const appointmentService = require('./services/appointmentService');
const courseService = require('./services/courseService');
const courseMembershipService = require('./services/courseMembershipService');
const compositeService = require('./services/compositeService');

app.use(express.json());
app.use(cors());

// Define specific base routes for each service
app.use('/schedules', scheduleService);
app.use('/appointments', appointmentService);
app.use('/courses', courseService);
app.use('/course-memberships', courseMembershipService);
app.use('/composite', compositeService);

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
