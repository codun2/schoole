<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\Accounting;
use App\Http\Controllers\Api\Admin;
use App\Http\Controllers\Api\Hr;
use App\Http\Controllers\Api\Inventory;
use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Api\School;
use App\Http\Controllers\Controller;
use App\Models;
use App\Models\SyncDeletion;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Feed for the admin app's offline mirror (IndexedDB on the manager's device).
 *
 *   GET /app/sync[?since=ISO]                → manifest: tables this user may mirror (+ row counts
 *                                                changed since) and deletion tombstones since `since`
 *   GET /app/sync?table=students&since=…&after=0&limit=1000
 *                                              → one page of rows (ordered by id, cursor = after)
 *
 * Rows come from the same ResourceController each list screen uses (same eager loads and
 * transforms), so the frontend renders them unchanged when the server is unreachable.
 * Tenant scoping is automatic (BelongsToCompany); all academic years are included.
 */
class SyncController extends Controller
{
    /** slug (as used by the frontend's /app/<slug> endpoints) => source + required permission. */
    private const TABLES = [
        // perm:school — structure & academics
        'academic-years'     => ['ctrl' => School\AcademicYearController::class, 'perm' => 'school'],
        'grades'             => ['ctrl' => School\GradeController::class, 'perm' => 'school'],
        'sections'           => ['ctrl' => School\SectionController::class, 'perm' => 'school'],
        'buses'              => ['ctrl' => School\BusController::class, 'perm' => 'school'],
        'fee-items'          => ['ctrl' => School\FeeItemController::class, 'perm' => 'school'],
        'custom-fields'      => ['ctrl' => School\CustomFieldController::class, 'perm' => 'school'],
        'subjects'           => ['ctrl' => School\SubjectController::class, 'perm' => 'school'],
        'exam-terms'         => ['ctrl' => School\ExamTermController::class, 'perm' => 'school'],
        'student-attendance' => ['model' => Models\StudentAttendance::class, 'with' => ['student:id,name'], 'perm' => 'school'],
        'grade-marks'        => ['model' => Models\GradeMark::class, 'with' => [], 'perm' => 'school'],
        'timetable-entries'  => ['model' => Models\TimetableEntry::class, 'with' => [], 'perm' => 'school'],
        // perm:students
        'guardians'          => ['ctrl' => School\GuardianController::class, 'perm' => 'students'],
        'students'           => ['ctrl' => School\StudentController::class, 'perm' => 'students'],
        'applications'       => ['ctrl' => School\ApplicationController::class, 'perm' => 'students'],
        // perm:finance
        'contracts'          => ['ctrl' => School\ContractController::class, 'with' => ['items'], 'perm' => 'finance'],
        'installments'       => ['model' => Models\Installment::class, 'with' => ['student:id,name', 'contract:id,number'], 'perm' => 'finance'],
        // perm:accounting
        'cash-accounts'      => ['ctrl' => Accounting\CashAccountController::class, 'perm' => 'accounting'],
        'customers'          => ['ctrl' => Accounting\CustomerController::class, 'perm' => 'accounting'],
        'suppliers'          => ['ctrl' => Accounting\SupplierController::class, 'perm' => 'accounting'],
        'expense-categories' => ['ctrl' => Accounting\ExpenseCategoryController::class, 'perm' => 'accounting'],
        'expenses'           => ['ctrl' => Accounting\ExpenseController::class, 'perm' => 'accounting'],
        'service-invoices'   => ['ctrl' => Accounting\ServiceInvoiceController::class, 'with' => ['items'], 'perm' => 'accounting'],
        'vouchers'           => ['ctrl' => Accounting\VoucherController::class, 'perm' => 'accounting'],
        // perm:hr
        'branches'           => ['ctrl' => Hr\BranchController::class, 'perm' => 'hr'],
        'departments'        => ['ctrl' => Hr\DepartmentController::class, 'perm' => 'hr'],
        'job-titles'         => ['ctrl' => Hr\JobTitleController::class, 'perm' => 'hr'],
        'employees'          => ['ctrl' => Hr\EmployeeController::class, 'perm' => 'hr'],
        'employee-attendance' => ['model' => Models\EmployeeAttendance::class, 'with' => [], 'perm' => 'hr'],
        'leave-types'        => ['ctrl' => Hr\LeaveTypeController::class, 'perm' => 'hr'],
        'leave-requests'     => ['ctrl' => Hr\LeaveRequestController::class, 'perm' => 'hr'],
        'advances'           => ['ctrl' => Hr\AdvanceController::class, 'perm' => 'hr'],
        'adjustments'        => ['ctrl' => Hr\AdjustmentController::class, 'perm' => 'hr'],
        'payrolls'           => ['model' => Models\Payroll::class, 'with' => ['items'], 'perm' => 'hr'],
        'employee-contracts' => ['ctrl' => Hr\EmployeeContractController::class, 'perm' => 'hr'],
        'evaluation-criteria' => ['ctrl' => Hr\EvaluationCriterionController::class, 'perm' => 'hr'],
        'evaluation-periods' => ['ctrl' => Hr\EvaluationPeriodController::class, 'perm' => 'hr'],
        'evaluations'        => ['model' => Models\Evaluation::class, 'with' => ['employee:id,name', 'period:id,name', 'scores'], 'perm' => 'hr'],
        // perm:inventory
        'inventory-categories' => ['ctrl' => Inventory\InventoryCategoryController::class, 'perm' => 'inventory'],
        'inventory-locations'  => ['ctrl' => Inventory\InventoryLocationController::class, 'perm' => 'inventory'],
        'inventory-items'      => ['ctrl' => Inventory\InventoryItemController::class, 'perm' => 'inventory'],
        'inventory-movements'  => ['model' => Models\InventoryMovement::class, 'with' => ['item:id,name,unit', 'fromLocation:id,name', 'toLocation:id,name'], 'perm' => 'inventory'],
        // perm:admin_affairs
        'correspondence-categories' => ['ctrl' => Admin\CorrespondenceCategoryController::class, 'perm' => 'admin_affairs'],
        'correspondences'    => ['ctrl' => Admin\CorrespondenceController::class, 'perm' => 'admin_affairs'],
        'licenses'           => ['ctrl' => Admin\LicenseController::class, 'perm' => 'admin_affairs'],
        'tasks'              => ['ctrl' => Admin\TaskController::class, 'perm' => 'admin_affairs'],
        'documents'          => ['ctrl' => Admin\DocumentController::class, 'perm' => 'admin_affairs'],
    ];

    public function index(Request $request)
    {
        $user = $request->user();
        $since = $request->since ? Carbon::parse($request->since) : null;
        $allowed = array_filter(self::TABLES, fn ($def) => $user->hasPerm($def['perm']));

        if (! $request->table) {
            $tables = [];
            foreach ($allowed as $slug => $def) {
                $q = $this->baseFor($def);
                $table = $q->getModel()->getTable();
                if ($since) {
                    $q->where($table.'.updated_at', '>', $since);
                }
                $tables[$slug] = ['table' => $table, 'count' => $q->count()];
            }
            $deleted = $since
                ? SyncDeletion::where('company_id', $user->company_id)->where('deleted_at', '>', $since)->get(['table', 'row_id'])
                : [];

            return response()->json([
                'server_time' => now()->toIso8601String(),
                'since'       => $since?->toIso8601String(),
                'tables'      => $tables,
                'deleted'     => $deleted,
            ]);
        }

        abort_unless(isset($allowed[$request->table]), 404);
        $def = $allowed[$request->table];
        $limit = min(max((int) $request->limit ?: 1000, 50), 2000);
        $after = (int) $request->after;

        $q = $this->baseFor($def);
        $table = $q->getModel()->getTable();
        if ($since) {
            $q->where($table.'.updated_at', '>', $since);
        }
        $rows = $q->where($table.'.id', '>', $after)->orderBy($table.'.id')->limit($limit + 1)->get();
        $more = $rows->count() > $limit;
        $rows = $rows->take($limit)->values();
        $out = isset($def['ctrl']) ? app($def['ctrl'])->syncTransform($rows) : $rows;

        return response()->json([
            'table'       => $request->table,
            'rows'        => $out,
            'next_after'  => $more ? $rows->last()->getKey() : null,
            'server_time' => now()->toIso8601String(),
        ]);
    }

    private function baseFor(array $def): Builder
    {
        if (isset($def['ctrl'])) {
            /** @var ResourceController $ctrl */
            $ctrl = app($def['ctrl']);
            $q = $ctrl->syncQuery();
        } else {
            $q = $def['model']::query();
        }
        if (! empty($def['with'])) {
            $q->with($def['with']);
        }

        return $q;
    }
}
