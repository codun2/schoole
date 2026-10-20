<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models;
use Illuminate\Http\Request;

/**
 * Small reference lists for dropdowns in one round-trip:
 *   GET /app/lookups?only=grades,sections,buses&year=ID
 */
class LookupController extends Controller
{
    public function __invoke(Request $request)
    {
        $yearId = $request->year && $request->year !== 'all' ? (int) $request->year : $request->user()->company->currentYearId();
        $only = array_filter(explode(',', (string) $request->only));

        $sources = [
            'years'          => fn () => Models\AcademicYear::orderByDesc('id')->get(['id', 'name', 'is_current']),
            'grades'         => fn () => Models\Grade::where('academic_year_id', $yearId)->orderBy('sort')->get(['id', 'name_ar', 'name_en']),
            'sections'       => fn () => Models\Section::where('academic_year_id', $yearId)->with('grade:id,name_ar')->orderBy('grade_id')->orderBy('name')->get(['id', 'name', 'grade_id']),
            'buses'          => fn () => Models\Bus::where('academic_year_id', $yearId)->orderBy('number')->get(['id', 'number', 'price', 'type']),
            'guardians'      => fn () => Models\Guardian::orderBy('name')->get(['id', 'name', 'phone', 'national_id']),
            'fee_items'      => fn () => Models\FeeItem::where('academic_year_id', $yearId)->orderBy('id')->get(['id', 'name', 'amount', 'type', 'grade_id', 'is_mandatory']),
            'branches'       => fn () => Models\Branch::orderBy('id')->get(['id', 'name']),
            'departments'    => fn () => Models\Department::orderBy('name')->get(['id', 'name']),
            'job_titles'     => fn () => Models\JobTitle::orderBy('name')->get(['id', 'name', 'department_id']),
            'employees'      => fn () => Models\Employee::where('status', '!=', 'terminated')->orderBy('name')->get(['id', 'name', 'number', 'is_teacher']),
            'teachers'       => fn () => Models\Employee::where('status', '!=', 'terminated')->where('is_teacher', true)->orderBy('name')->get(['id', 'name']),
            'leave_types'    => fn () => Models\LeaveType::orderBy('id')->get(['id', 'name', 'days_per_year']),
            'cash_accounts'  => fn () => Models\CashAccount::where('is_active', true)->orderBy('id')->get(['id', 'name', 'type']),
            'customers'      => fn () => Models\Customer::orderBy('name')->get(['id', 'name', 'phone']),
            'suppliers'      => fn () => Models\Supplier::orderBy('name')->get(['id', 'name']),
            'expense_categories' => fn () => Models\ExpenseCategory::orderBy('name')->get(['id', 'name', 'color']),
            'correspondence_categories' => fn () => Models\CorrespondenceCategory::orderBy('name')->get(['id', 'name']),
            'users'          => fn () => Models\User::whereIn('role', ['admin', 'staff'])->where('status', 'active')->orderBy('name')->get(['id', 'name']),
            'custom_fields'  => fn () => Models\CustomField::orderBy('sort')->get(),
            'subjects'       => fn () => Models\Subject::where('academic_year_id', $yearId)->orderBy('sort')->get(['id', 'name_ar', 'grade_id', 'max_mark']),
            'exam_terms'     => fn () => Models\ExamTerm::where('academic_year_id', $yearId)->orderBy('sort')->get(['id', 'name', 'weight', 'is_locked']),
        ];

        $out = ['year_id' => $yearId];
        foreach ($only ?: array_keys($sources) as $k) {
            if (isset($sources[$k])) {
                $out[$k] = $sources[$k]();
            }
        }

        return response()->json($out);
    }
}
