<?php

use App\Http\Controllers\Api\Accounting;
use App\Http\Controllers\Api\Admin;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\Hr;
use App\Http\Controllers\Api\Portal\PortalController;
use App\Http\Controllers\Api\PublicController;
use App\Http\Controllers\Api\School;
use App\Http\Controllers\Api\Inventory;
use App\Http\Controllers\Api\Teacher\TeacherController;
use App\Http\Controllers\Api\Super\PlatformController;
use Illuminate\Support\Facades\Route;

/** Standard REST routes for a ResourceController: index/store/show/update/destroy. */
if (! function_exists('crud')) {
function crud(string $uri, string $controller): void
{
    Route::get($uri, [$controller, 'index']);
    Route::post($uri, [$controller, 'store']);
    Route::get("$uri/{id}", [$controller, 'show'])->whereNumber('id');
    Route::match(['put', 'patch'], "$uri/{id}", [$controller, 'update'])->whereNumber('id');
    Route::post("$uri/{id}", [$controller, 'update'])->whereNumber('id'); // multipart updates
    Route::delete("$uri/{id}", [$controller, 'destroy'])->whereNumber('id');
}
}

/*
|--------------------------------------------------------------------------
| Public
|--------------------------------------------------------------------------
*/
Route::middleware('throttle:20,1')->group(function () {
    Route::post('auth/login', [AuthController::class, 'login']);
    Route::post('register', [PublicController::class, 'register']);
    Route::post('public/schools/{slug}/apply', [PublicController::class, 'apply']);
});
Route::get('public/plans', [PublicController::class, 'plans']);
Route::get('public/schools/{slug}', [PublicController::class, 'school']);

/*
|--------------------------------------------------------------------------
| Any signed-in user
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'company'])->prefix('auth')->group(function () {
    Route::get('me', [AuthController::class, 'me']);
    Route::post('logout', [AuthController::class, 'logout']);
    Route::patch('profile', [AuthController::class, 'updateProfile']);
});

/*
|--------------------------------------------------------------------------
| School dashboard (admin + staff)
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'staff', 'company', 'idem'])->prefix('app')->group(function () {
    Route::get('badges', [AuthController::class, 'badges']);
    Route::get('lookups', School\LookupController::class);
    Route::get('sync', [School\SyncController::class, 'index']); // offline mirror feed (permission-filtered inside)
    Route::get('notifications', [School\NotificationController::class, 'index']);
    Route::post('notifications/read-all', [School\NotificationController::class, 'readAll']);
    Route::get('announcements', [School\NotificationController::class, 'announcements']);

    Route::get('dashboard/main', [School\DashboardController::class, 'main']);

    // ---- Schools: structure
    Route::middleware('perm:school')->group(function () {
        Route::get('dashboard/school', [School\DashboardController::class, 'school']);
        crud('academic-years', School\AcademicYearController::class);
        Route::post('academic-years/{id}/current', [School\AcademicYearController::class, 'setCurrent']);
        Route::post('academic-years/{id}/clone', [School\AcademicYearController::class, 'cloneStructure']);
        crud('grades', School\GradeController::class);
        crud('sections', School\SectionController::class);
        crud('buses', School\BusController::class);
        Route::get('buses/{id}/students', [School\BusController::class, 'students']);
        crud('fee-items', School\FeeItemController::class);
        crud('custom-fields', School\CustomFieldController::class);
        Route::get('attendance/sheet', [School\AttendanceController::class, 'sheet']);
        Route::post('attendance', [School\AttendanceController::class, 'save']);
        Route::get('attendance/report', [School\AttendanceController::class, 'report']);

        // Academic: subjects, exam terms, grade marks, report cards, class results
        crud('subjects', School\SubjectController::class);
        crud('exam-terms', School\ExamTermController::class);
        Route::get('grades/sheet', [School\MarkController::class, 'sheet']);
        Route::post('grades/sheet', [School\MarkController::class, 'save']); // was POST grades — it shadowed GradeController@store (creating a grade)
        Route::get('grades/report-card/{student}', [School\MarkController::class, 'reportCard'])->whereNumber('student');
        Route::get('grades/class-results', [School\MarkController::class, 'classResults']);

        // Timetable
        Route::get('timetable/config', [School\TimetableController::class, 'config']);
        Route::patch('timetable/config', [School\TimetableController::class, 'updateConfig']);
        Route::get('timetable/section', [School\TimetableController::class, 'section']);
        Route::post('timetable/section', [School\TimetableController::class, 'save']);
        Route::get('timetable/teacher/{teacher}', [School\TimetableController::class, 'teacher'])->whereNumber('teacher');
        Route::get('timetable/load', [School\TimetableController::class, 'load']);
    });

    // ---- Schools: people
    Route::middleware('perm:students')->group(function () {
        crud('guardians', School\GuardianController::class);
        Route::post('guardians/import', [School\GuardianController::class, 'import']);
        crud('students', School\StudentController::class);
        Route::post('students/import', [School\StudentController::class, 'import']);
        Route::post('students/bulk', [School\StudentController::class, 'bulk']);
        crud('applications', School\ApplicationController::class);
        Route::post('applications/{id}/accept', [School\ApplicationController::class, 'accept']);
        Route::post('applications/{id}/reject', [School\ApplicationController::class, 'reject']);
    });

    // ---- Schools: fees & collection
    Route::middleware('perm:finance')->group(function () {
        crud('contracts', School\ContractController::class);
        Route::post('contracts/{id}/activate', [School\ContractController::class, 'activate']);
        Route::post('contracts/{id}/cancel', [School\ContractController::class, 'cancel']);
        Route::post('contracts/{id}/payments', [School\ContractController::class, 'pay']);
        Route::delete('contracts/{id}/payments/{voucher}', [School\ContractController::class, 'deletePayment']);
        Route::get('installments', [School\InstallmentController::class, 'index']);
        Route::get('tuition-payments', [School\InstallmentController::class, 'payments']);
    });

    // ---- Accounting
    Route::middleware('perm:accounting')->group(function () {
        Route::get('dashboard/accounting', [School\DashboardController::class, 'accounting']);
        Route::get('reports/finance', [School\DashboardController::class, 'reports']);
        crud('cash-accounts', Accounting\CashAccountController::class);
        crud('customers', Accounting\CustomerController::class);
        crud('suppliers', Accounting\SupplierController::class);
        crud('expense-categories', Accounting\ExpenseCategoryController::class);
        crud('expenses', Accounting\ExpenseController::class);
        Route::post('expenses/{id}/pay', [Accounting\ExpenseController::class, 'pay']);
        crud('service-invoices', Accounting\ServiceInvoiceController::class);
        Route::post('service-invoices/{id}/pay', [Accounting\ServiceInvoiceController::class, 'pay']);
        Route::post('service-invoices/{id}/cancel', [Accounting\ServiceInvoiceController::class, 'cancel']);
        crud('vouchers', Accounting\VoucherController::class);
    });

    // ---- HR
    Route::middleware('perm:hr')->group(function () {
        Route::get('dashboard/hr', [School\DashboardController::class, 'hr']);
        crud('branches', Hr\BranchController::class);
        crud('departments', Hr\DepartmentController::class);
        crud('job-titles', Hr\JobTitleController::class);
        crud('employees', Hr\EmployeeController::class);
        Route::get('employee-attendance/sheet', [Hr\EmployeeAttendanceController::class, 'sheet']);
        Route::post('employee-attendance', [Hr\EmployeeAttendanceController::class, 'save']);
        Route::get('employee-attendance/summary', [Hr\EmployeeAttendanceController::class, 'summary']);
        crud('leave-types', Hr\LeaveTypeController::class);
        Route::get('leave-balances', [Hr\LeaveTypeController::class, 'balances']);
        crud('leave-requests', Hr\LeaveRequestController::class);
        Route::post('leave-requests/{id}/decide', [Hr\LeaveRequestController::class, 'decide']);
        crud('advances', Hr\AdvanceController::class);
        crud('adjustments', Hr\AdjustmentController::class);
        Route::get('payrolls', [Hr\PayrollController::class, 'index']);
        Route::post('payrolls/generate', [Hr\PayrollController::class, 'generate']);
        Route::get('payrolls/{id}', [Hr\PayrollController::class, 'show']);
        Route::post('payrolls/{id}/approve', [Hr\PayrollController::class, 'approve']);
        Route::post('payrolls/{id}/pay', [Hr\PayrollController::class, 'pay']);
        Route::delete('payrolls/{id}', [Hr\PayrollController::class, 'destroy']);

        // Employee contracts + evaluations
        crud('employee-contracts', Hr\EmployeeContractController::class);
        crud('evaluation-criteria', Hr\EvaluationCriterionController::class);
        crud('evaluation-periods', Hr\EvaluationPeriodController::class);
        Route::get('evaluations', [Hr\EvaluationController::class, 'index']);
        Route::get('evaluations/form', [Hr\EvaluationController::class, 'form']);
        Route::get('evaluations/{id}', [Hr\EvaluationController::class, 'show'])->whereNumber('id');
        Route::post('evaluations', [Hr\EvaluationController::class, 'store']);
        Route::match(['put', 'patch'], 'evaluations/{id}', [Hr\EvaluationController::class, 'update'])->whereNumber('id');
        Route::delete('evaluations/{id}', [Hr\EvaluationController::class, 'destroy'])->whereNumber('id');
    });

    // ---- Administrative affairs
    Route::middleware('perm:admin_affairs')->group(function () {
        Route::get('dashboard/admin', [School\DashboardController::class, 'admin']);
        crud('correspondence-categories', Admin\CorrespondenceCategoryController::class);
        crud('correspondences', Admin\CorrespondenceController::class);
        crud('licenses', Admin\LicenseController::class);
        crud('tasks', Admin\TaskController::class);
        Route::get('tasks-calendar', [Admin\TaskController::class, 'calendar']);
        crud('documents', Admin\DocumentController::class);
        Route::get('document-categories', [Admin\DocumentController::class, 'categories']);
    });

    // ---- Inventory: assets & consumables
    Route::middleware('perm:inventory')->group(function () {
        Route::get('dashboard/inventory', [Inventory\InventoryMovementController::class, 'dashboard']);
        crud('inventory-categories', Inventory\InventoryCategoryController::class);
        crud('inventory-locations', Inventory\InventoryLocationController::class);
        crud('inventory-items', Inventory\InventoryItemController::class);
        Route::get('inventory-movements', [Inventory\InventoryMovementController::class, 'index']);
        Route::post('inventory-movements', [Inventory\InventoryMovementController::class, 'store']);
        Route::delete('inventory-movements/{id}', [Inventory\InventoryMovementController::class, 'destroy'])->whereNumber('id');
    });

    // ---- Settings & users
    Route::middleware('perm:settings')->group(function () {
        Route::get('settings', [School\SettingsController::class, 'show']);
        Route::patch('settings', [School\SettingsController::class, 'update']);
        Route::post('settings/logo', [School\SettingsController::class, 'logo']);
        Route::get('school-announcements', [School\NotificationController::class, 'manageAnnouncements']);
        Route::post('school-announcements', [School\NotificationController::class, 'storeAnnouncement']);
        Route::patch('school-announcements/{id}', [School\NotificationController::class, 'updateAnnouncement']);
        Route::delete('school-announcements/{id}', [School\NotificationController::class, 'destroyAnnouncement']);
        Route::get('activity', [School\NotificationController::class, 'activity']);
    });
    Route::middleware('perm:users')->group(function () {
        crud('users', School\UserController::class);
    });
});

/*
|--------------------------------------------------------------------------
| Parent portal
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'guardian', 'company'])->prefix('portal')->group(function () {
    Route::get('home', [PortalController::class, 'home']);
    Route::get('children/{id}', [PortalController::class, 'child'])->whereNumber('id');
    Route::get('payments', [PortalController::class, 'payments']);
});

/*
|--------------------------------------------------------------------------
| Teacher portal (role=teacher) — row-scoped to their own sections/students
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'teacher', 'company'])->prefix('teacher')->group(function () {
    Route::get('home', [TeacherController::class, 'home']);
    Route::get('sections', [TeacherController::class, 'sections']);
    Route::get('grade-options', [TeacherController::class, 'gradeOptions']);
    Route::get('students', [TeacherController::class, 'students']);
    Route::post('students', [TeacherController::class, 'storeStudent']);
    Route::match(['put', 'patch'], 'students/{id}', [TeacherController::class, 'updateStudent'])->whereNumber('id');
    Route::get('marks/sheet', [TeacherController::class, 'marksSheet']);
    Route::post('marks', [TeacherController::class, 'marksSave']);
    Route::get('report-card/{student}', [TeacherController::class, 'reportCard'])->whereNumber('student');
    Route::get('class-results', [TeacherController::class, 'classResults']);
    Route::get('attendance/sheet', [TeacherController::class, 'attendanceSheet']);
    Route::post('attendance', [TeacherController::class, 'attendanceSave']);
});

/*
|--------------------------------------------------------------------------
| Platform owner
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'super', 'company'])->prefix('super')->group(function () {
    Route::get('dashboard', [PlatformController::class, 'dashboard']);
    Route::get('schools', [PlatformController::class, 'schools']);
    Route::post('schools', [PlatformController::class, 'storeSchool']);
    Route::patch('schools/{id}', [PlatformController::class, 'updateSchool']);
    Route::post('schools/{id}/status', [PlatformController::class, 'setStatus']);
    Route::post('schools/{id}/impersonate', [PlatformController::class, 'impersonate']);
    Route::delete('schools/{id}', [PlatformController::class, 'destroySchool']);
    Route::get('plans', [PlatformController::class, 'plans']);
    Route::post('plans', [PlatformController::class, 'storePlan']);
    Route::patch('plans/{id}', [PlatformController::class, 'updatePlan']);
    Route::delete('plans/{id}', [PlatformController::class, 'destroyPlan']);
    Route::get('announcements', [PlatformController::class, 'announcements']);
    Route::post('announcements', [PlatformController::class, 'storeAnnouncement']);
    Route::delete('announcements/{id}', [PlatformController::class, 'destroyAnnouncement']);
});
