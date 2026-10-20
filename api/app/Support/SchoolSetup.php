<?php

namespace App\Support;

use App\Models\AcademicYear;
use App\Models\Branch;
use App\Models\CashAccount;
use App\Models\Company;
use App\Models\CorrespondenceCategory;
use App\Models\ExpenseCategory;
use App\Models\LeaveType;

/** Starter data every new school gets so its screens are usable on day one. */
class SchoolSetup
{
    public static function defaults(Company $company): void
    {
        app()->instance('currentCompanyId', $company->id);

        $y = (int) date('n') >= 8 ? (int) date('Y') : (int) date('Y') - 1;
        AcademicYear::create(['name' => $y.'/'.($y + 1), 'start_date' => $y.'-08-25', 'end_date' => ($y + 1).'-06-15', 'is_current' => true]);
        Branch::create(['name' => 'الفرع الرئيسي', 'city' => $company->city, 'is_main' => true]);
        CashAccount::create(['name' => 'الصندوق الرئيسي', 'type' => 'cash']);
        CashAccount::create(['name' => 'الحساب البنكي', 'type' => 'bank']);

        foreach (['رواتب وأجور', 'إيجارات', 'كهرباء ومياه', 'صيانة', 'قرطاسية ومستلزمات', 'وقود ونقل', 'تسويق', 'أخرى'] as $c) {
            ExpenseCategory::create(['name' => $c]);
        }
        foreach ([['سنوية', 30, true], ['مرضية', 15, true], ['طارئة', 5, true], ['بدون راتب', 0, false]] as [$n, $d, $p]) {
            LeaveType::create(['name' => $n, 'days_per_year' => $d, 'is_paid' => $p]);
        }
        foreach (['وزارة التربية والتعليم', 'أولياء الأمور', 'جهات حكومية', 'موردون', 'داخلي'] as $c) {
            CorrespondenceCategory::create(['name' => $c]);
        }

        app()->forgetInstance('currentCompanyId');
    }
}
