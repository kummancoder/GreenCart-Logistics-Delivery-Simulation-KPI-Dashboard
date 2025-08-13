import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Driver name is required"],
        trim: true,
        minlength: [2, "Driver name must be at least 2 characters"],
        maxlength: [50, "Driver name cannot exceed 50 characters"]
    },
    shiftHours: {
        type: Number,
        required: [true, "Shift hours is required"],
        min: [1, "Shift hours must be at least 1"],
        max: [12, "Shift hours cannot exceed 12"]
    },
    pastWeekHours: {
        type: [Number],
        required: [true, "Past week hours is required"],
        validate: {
            validator: function(hours) {
                return hours.length === 7 && hours.every(h => h >= 0 && h <= 24);
            },
            message: "Past week hours must contain exactly 7 values, each between 0-24"
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    efficiency: {
        type: Number,
        default: 100,
        min: [0, "Efficiency cannot be negative"],
        max: [100, "Efficiency cannot exceed 100%"]
    },
    totalDeliveries: {
        type: Number,
        default: 0,
        min: [0, "Total deliveries cannot be negative"]
    },
    onTimeDeliveries: {
        type: Number,
        default: 0,
        min: [0, "On-time deliveries cannot be negative"]
    },
    currentDayHours: {
        type: Number,
        default: 0,
        min: [0, "Current day hours cannot be negative"]
    },
    fatigueLevel: {
        type: String,
        enum: ['normal', 'tired', 'exhausted'],
        default: 'normal'
    }
}, {
    timestamps: true
});

driverSchema.index({ isActive: 1 });
driverSchema.index({ name: 1 });

driverSchema.virtual('averageWeeklyHours').get(function() {
    return Math.round((this.pastWeekHours.reduce((sum, hours) => sum + hours, 0) / 7) * 100) / 100;
});

driverSchema.virtual('successRate').get(function() {
    return this.totalDeliveries > 0 ? 
        Math.round((this.onTimeDeliveries / this.totalDeliveries) * 100) : 0;
});

driverSchema.virtual('isFatigued').get(function() {
    return this.pastWeekHours.some(hours => hours > 8);
});

driverSchema.methods.workedOvertimeYesterday = function() {
    return this.pastWeekHours[6] > 8;
};

driverSchema.methods.updateDeliveryStats = function(wasOnTime) {
    this.totalDeliveries += 1;
    if (wasOnTime) {
        this.onTimeDeliveries += 1;
    }
    
    this.efficiency = this.totalDeliveries > 0 ? 
        Math.round((this.onTimeDeliveries / this.totalDeliveries) * 100) : 100;
    
    return this.save();
};

driverSchema.methods.updateDailyHours = function(hoursWorked) {
    this.pastWeekHours.shift();
    this.pastWeekHours.push(hoursWorked);
    
    const overworkDays = this.pastWeekHours.filter(h => h > 8).length;
    if (overworkDays >= 3) {
        this.fatigueLevel = 'exhausted';
    } else if (overworkDays >= 1) {
        this.fatigueLevel = 'tired';  
    } else {
        this.fatigueLevel = 'normal';
    }
    
    return this.save();
};

driverSchema.statics.findAvailableDrivers = function(maxHours) {
    return this.find({
        isActive: true,
        currentDayHours: { $lt: maxHours }
    }).sort({ efficiency: -1, onTimeDeliveries: -1 });
};

driverSchema.set('toJSON', { virtuals: true });
driverSchema.set('toObject', { virtuals: true });

export const Driver = mongoose.model("Driver", driverSchema);
