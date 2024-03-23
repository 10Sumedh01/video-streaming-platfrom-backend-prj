class ApiError extends Error {
    constructor(statusCode, message = "Something went wrong", errors = [], stack = "") {
        this.statusCode = statusCode;
        this.message = message;
        this.errors = errors;
        this.data = null;
        this.success = false; //Error BOOO!

        if (stack) {
            this.stack = stack
        } else {
            Error.captureStackTrace(this, this.constructor); 
        }
    }
}

export { ApiError } 