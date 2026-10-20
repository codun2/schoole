<?php

namespace Database\Seeders;

use App\Models;
use App\Support\Finance;
use App\Support\Numbering;
use App\Support\SchoolSetup;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

/**
 * Demo platform: three plans, a super-admin, and one fully populated Omani
 * private school ("مدرسة المستقبل الخاصة") so every screen has real data.
 * Idempotent: does nothing if the demo school already exists.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (Models\Company::where('slug', 'almustaqbal')->exists()) {
            return;
        }
        mt_srand(2026);

        $plans = [
            Models\Plan::create(['name' => 'الأساسية', 'description' => 'للمدارس الصغيرة', 'price_monthly' => 19, 'price_yearly' => 190, 'max_students' => 300, 'max_users' => 5, 'features' => ['الطلاب وأولياء الأمور', 'العقود والأقساط', 'الحضور والغياب'], 'sort' => 1]),
            Models\Plan::create(['name' => 'الاحترافية', 'description' => 'الأكثر طلباً', 'price_monthly' => 39, 'price_yearly' => 390, 'max_students' => 1000, 'max_users' => 20, 'features' => ['كل مزايا الأساسية', 'المحاسبة والتقارير', 'الموارد البشرية والرواتب', 'بوابة ولي الأمر'], 'sort' => 2]),
            Models\Plan::create(['name' => 'المؤسسات', 'description' => 'لمجموعات المدارس', 'price_monthly' => 79, 'price_yearly' => 790, 'max_students' => 0, 'max_users' => 0, 'features' => ['كل المزايا', 'فروع متعددة', 'دعم مخصّص', 'تخصيص كامل'], 'sort' => 3]),
        ];

        Models\User::create(['company_id' => null, 'name' => 'إدارة منصة سكوول', 'email' => 'super@schoole.app', 'role' => 'super', 'status' => 'active', 'password' => 'password']);

        $school = Models\Company::create([
            'name' => 'مدرسة المستقبل الخاصة', 'name_en' => 'Al Mustaqbal Private School', 'slug' => 'almustaqbal',
            'status' => 'active', 'plan_id' => $plans[1]->id, 'subscription_ends_at' => now()->addMonths(10),
            'phone' => '24501234', 'email' => 'info@almustaqbal.om', 'city' => 'مسقط', 'address' => 'الخوض، مسقط، سلطنة عُمان',
            'principal_name' => 'أ. سالم بن ناصر الرحبي', 'cr_number' => '1234567', 'license_number' => 'MOE-2019-0456',
            'currency' => 'OMR', 'tax_rate' => 0, 'contract_prefix' => 'SCH', 'receipt_prefix' => 'RC',
        ]);
        // Two more schools so the platform dashboard isn't empty.
        $other1 = Models\Company::create(['name' => 'مدرسة النور العالمية', 'slug' => 'alnoor', 'status' => 'active', 'plan_id' => $plans[2]->id, 'city' => 'صحار', 'email' => 'info@alnoor.om', 'phone' => '26801122', 'currency' => 'OMR']);
        $other2 = Models\Company::create(['name' => 'روضة البراعم', 'slug' => 'albaraem', 'status' => 'pending', 'plan_id' => $plans[0]->id, 'city' => 'نزوى', 'email' => 'hello@albaraem.om', 'phone' => '25401010', 'currency' => 'OMR', 'trial_ends_at' => now()->addDays(10)]);
        foreach ([[$other1, 'مدير النور', 'admin@alnoor.om'], [$other2, 'مديرة البراعم', 'admin@albaraem.om']] as [$co, $n, $e]) {
            Models\User::create(['company_id' => $co->id, 'name' => $n, 'email' => $e, 'role' => 'admin', 'status' => 'active', 'password' => 'password']);
            SchoolSetup::defaults($co);
        }

        SchoolSetup::defaults($school);
        app()->instance('currentCompanyId', $school->id);

        $admin = Models\User::create(['name' => 'mazoonsoft', 'email' => 'admin@schoole.app', 'phone' => '96899000000', 'role' => 'admin', 'title' => 'مدير النظام', 'status' => 'active', 'password' => 'password']);
        $finance = Models\User::create(['name' => 'نورة الهنائية', 'email' => 'finance@schoole.app', 'role' => 'staff', 'title' => 'محاسبة', 'status' => 'active', 'password' => 'password', 'permissions' => ['finance', 'accounting', 'students']]);
        $hrUser = Models\User::create(['name' => 'مريم الزدجالية', 'email' => 'hr@schoole.app', 'role' => 'staff', 'title' => 'أخصائية موارد بشرية', 'status' => 'active', 'password' => 'password', 'permissions' => ['hr', 'admin_affairs']]);
        auth()->setUser($admin);

        // ---------------------------------------------------------------- years
        $current = Models\AcademicYear::where('is_current', true)->first();
        $current->update(['name' => '2026/2027', 'start_date' => '2026-08-23', 'end_date' => '2027-06-10']);
        Models\AcademicYear::create(['name' => '2025/2026', 'start_date' => '2025-08-24', 'end_date' => '2026-06-11', 'is_current' => false]);
        $yid = $current->id;

        $mainBranch = Models\Branch::where('is_main', true)->first();
        $mainBranch->update(['name' => 'فرع مسقط', 'city' => 'مسقط']);
        $sohar = Models\Branch::create(['name' => 'فرع صحار', 'city' => 'صحار', 'phone' => '26841234']);

        // ---------------------------------------------------------------- HR
        $deps = [];
        foreach (['الإدارة العامة', 'الهيئة التدريسية', 'المالية والمحاسبة', 'الموارد البشرية', 'شؤون الطلاب', 'الخدمات والنقل', 'تقنية المعلومات'] as $d) {
            $deps[$d] = Models\Department::create(['name' => $d]);
        }
        $titles = [];
        foreach ([['مدير المدرسة', 'الإدارة العامة'], ['مساعد المدير', 'الإدارة العامة'], ['معلم', 'الهيئة التدريسية'], ['معلمة رياض أطفال', 'الهيئة التدريسية'], ['محاسب', 'المالية والمحاسبة'], ['أخصائي موارد بشرية', 'الموارد البشرية'], ['أخصائي اجتماعي', 'شؤون الطلاب'], ['مسجّل', 'شؤون الطلاب'], ['سائق حافلة', 'الخدمات والنقل'], ['مشرف نقل', 'الخدمات والنقل'], ['فني تقنية معلومات', 'تقنية المعلومات']] as [$t, $d]) {
            $titles[$t] = Models\JobTitle::create(['name' => $t, 'department_id' => $deps[$d]->id]);
        }
        $staff = [
            ['أحمد بن سليمان الخالدي', 'male', 'مدير المدرسة', 1200, 200, 80, false, '2020-01-10'],
            ['سالم بن ناصر الحضرمي', 'male', 'مساعد المدير', 850, 150, 60, false, '2021-03-01'],
            ['فاطمة بنت علي البلوشية', 'female', 'معلم', 520, 80, 40, true, '2021-08-20'],
            ['خديجة بنت سعيد الكندية', 'female', 'معلم', 500, 80, 40, true, '2022-08-21'],
            ['محمد بن خلفان الرواحي', 'male', 'معلم', 560, 80, 40, true, '2020-08-23'],
            ['عائشة بنت حمد المعمرية', 'female', 'معلمة رياض أطفال', 420, 60, 30, true, '2023-08-20'],
            ['زينب بنت راشد الشكيلية', 'female', 'معلمة رياض أطفال', 410, 60, 30, true, '2024-08-18'],
            ['يوسف بن عبدالله الهاشمي', 'male', 'معلم', 540, 80, 40, true, '2022-01-05'],
            ['مريم بنت عبدالله الزدجالية', 'female', 'أخصائي موارد بشرية', 480, 70, 30, false, '2022-06-15'],
            ['نورة بنت محمد الهنائية', 'female', 'محاسب', 500, 70, 30, false, '2024-04-01'],
            ['هدى بنت سيف البلوشية', 'female', 'أخصائي اجتماعي', 450, 60, 30, false, '2023-01-20'],
            ['أسماء بنت خلفان الكندية', 'female', 'مسجّل', 380, 50, 25, false, '2023-08-10'],
            ['خميس بن راشد المعمري', 'male', 'مشرف نقل', 350, 40, 20, false, '2020-09-05'],
            ['طلال بن سعيد العامري', 'male', 'سائق حافلة', 325, 40, 20, false, '2024-09-15'],
            ['ماجد بن علي الشكيلي', 'male', 'سائق حافلة', 325, 40, 20, false, '2021-02-14'],
            ['يعقوب بن حمد الرواحي', 'male', 'فني تقنية معلومات', 460, 60, 30, false, '2022-11-01'],
        ];
        $employees = [];
        foreach ($staff as $i => [$n, $g, $t, $sal, $house, $trans, $teacher, $hire]) {
            $employees[] = Models\Employee::create([
                'number' => 'EMP-'.str_pad((string) ($i + 1), 6, '0', STR_PAD_LEFT), 'name' => $n, 'gender' => $g, 'nationality' => 'عماني',
                'national_id' => (string) (10000000 + $i * 7919), 'phone' => '968910050'.str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT),
                'branch_id' => $i % 6 === 5 ? $sohar->id : $mainBranch->id, 'department_id' => $titles[$t]->department_id, 'job_title_id' => $titles[$t]->id,
                'is_teacher' => $teacher, 'hire_date' => $hire, 'status' => 'active', 'basic_salary' => $sal, 'housing_allowance' => $house, 'transport_allowance' => $trans,
                'bank_name' => ['بنك مسقط', 'البنك الوطني العماني', 'بنك ظفار'][$i % 3], 'iban' => 'OM'.str_pad((string) (810000000 + $i * 1237), 21, '0', STR_PAD_LEFT),
            ]);
        }
        $deps['الإدارة العامة']->update(['manager_id' => $employees[0]->id]);
        $teachers = array_values(array_filter($employees, fn ($e) => $e->is_teacher));

        // ---------------------------------------------------------------- structure
        $gradeDefs = [['روضة أولى', 'KG 1', 950], ['روضة ثانية', 'KG 2', 1000], ['الصف الأول', 'Grade 1', 1250], ['الصف الثاني', 'Grade 2', 1300], ['الصف الثالث', 'Grade 3', 1350], ['الصف الرابع', 'Grade 4', 1450], ['الصف الخامس', 'Grade 5', 1500], ['الصف السادس', 'Grade 6', 1550]];
        $grades = [];
        $sections = [];
        foreach ($gradeDefs as $i => [$ar, $en, $fee]) {
            $g = Models\Grade::create(['academic_year_id' => $yid, 'name_ar' => $ar, 'name_en' => $en, 'sort' => $i + 1]);
            $grades[] = $g;
            foreach ($i < 4 ? ['شعبة أ', 'شعبة ب'] : ['شعبة أ'] as $j => $sn) {
                $sections[$g->id][] = Models\Section::create(['academic_year_id' => $yid, 'grade_id' => $g->id, 'name' => $sn, 'capacity' => $i < 2 ? 20 : 28, 'room' => 'قاعة '.($i + 1).($j ? 'ب' : 'أ'), 'teacher_id' => $teachers[($i + $j) % count($teachers)]->id]);
            }
            Models\FeeItem::create(['academic_year_id' => $yid, 'grade_id' => $g->id, 'name' => 'الرسوم الدراسية — '.$ar, 'type' => 'tuition', 'amount' => $fee, 'is_mandatory' => true]);
        }
        $regFee = Models\FeeItem::create(['academic_year_id' => $yid, 'name' => 'رسوم التسجيل', 'type' => 'registration', 'amount' => 50, 'is_mandatory' => true]);
        $books = Models\FeeItem::create(['academic_year_id' => $yid, 'name' => 'الكتب والقرطاسية', 'type' => 'books', 'amount' => 40, 'is_mandatory' => true]);
        Models\FeeItem::create(['academic_year_id' => $yid, 'name' => 'الزي المدرسي', 'type' => 'uniform', 'amount' => 25, 'is_mandatory' => false]);
        Models\FeeItem::create(['academic_year_id' => $yid, 'name' => 'الأنشطة والرحلات', 'type' => 'activity', 'amount' => 30, 'is_mandatory' => false]);

        $buses = [
            Models\Bus::create(['academic_year_id' => $yid, 'number' => '2432243', 'type' => 'باص 26 راكب', 'driver_name' => 'طلال العامري', 'driver_phone' => '96891005014', 'supervisor_name' => 'خميس المعمري', 'capacity' => 26, 'price' => 150, 'route' => 'الخوض — المعبيلة — السيب']),
            Models\Bus::create(['academic_year_id' => $yid, 'number' => '1187654', 'type' => 'باص 20 راكب', 'driver_name' => 'ماجد الشكيلي', 'driver_phone' => '96891005015', 'capacity' => 20, 'price' => 130, 'route' => 'الخوض — العذيبة — الغبرة']),
            Models\Bus::create(['academic_year_id' => $yid, 'number' => '3390012', 'type' => 'فان 14 راكب', 'driver_name' => 'سعيد البادي', 'driver_phone' => '96891005016', 'capacity' => 14, 'price' => 120, 'route' => 'الخوض — الموالح']),
        ];

        // ---------------------------------------------------------------- families
        $families = [
            ['سالم بن ناصر الرحبي', '12345678', [['ريم بنت سالم الرحبية', 'female', 2], ['ناصر بن سالم الرحبي', 'male', 0]]],
            ['خالد بن عبدالله البلوشي', '87654321', [['يوسف بن خالد البلوشي', 'male', 2], ['مريم بنت خالد البلوشية', 'female', 4]]],
            ['سعيد بن حمد الكلباني', '23456789', [['حمد بن سعيد الكلباني', 'male', 3]]],
            ['علي بن محمد الهنائي', '34567890', [['ليان بنت علي الهنائية', 'female', 1], ['محمد بن علي الهنائي', 'male', 5]]],
            ['حمود بن راشد السيابي', '45678901', [['راشد بن حمود السيابي', 'male', 6]]],
            ['عبدالله بن سيف الغافري', '56789012', [['سيف بن عبدالله الغافري', 'male', 7], ['شهد بنت عبدالله الغافرية', 'female', 3]]],
            ['ناصر بن خميس الحارثي', '67890123', [['جود بنت ناصر الحارثية', 'female', 0]]],
            ['محمود بن سالم العبري', '78901234', [['سالم بن محمود العبري', 'male', 4], ['أروى بنت محمود العبرية', 'female', 2]]],
            ['هلال بن سعود البوسعيدي', '89012345', [['سعود بن هلال البوسعيدي', 'male', 5]]],
            ['أحمد بن مبارك المقبالي', '90123456', [['ملاك بنت أحمد المقبالية', 'female', 1], ['مبارك بن أحمد المقبالي', 'male', 6]]],
            ['ياسر بن عامر الفارسي', '11223344', [['عامر بن ياسر الفارسي', 'male', 3]]],
            ['بدر بن حارب الريامي', '22334455', [['لمى بنت بدر الريامية', 'female', 7]]],
            ['فهد بن زاهر الوهيبي', '33445566', [['زاهر بن فهد الوهيبي', 'male', 2], ['رهف بنت فهد الوهيبية', 'female', 0]]],
            ['منصور بن سليم الجابري', '44556677', [['سليم بن منصور الجابري', 'male', 4]]],
            ['طارق بن خلف العريمي', '55667788', [['دانة بنت طارق العريمية', 'female', 5], ['خلف بن طارق العريمي', 'male', 1]]],
            ['سليمان بن عيسى الشيدي', '66778899', [['عيسى بن سليمان الشيدي', 'male', 6]]],
            ['ماجد بن ثاني المحرزي', '77889900', [['حلا بنت ماجد المحرزية', 'female', 3]]],
            ['عادل بن جمعة اليحيائي', '88990011', [['جمعة بن عادل اليحيائي', 'male', 7], ['نور بنت عادل اليحيائية', 'female', 4]]],
        ];
        $firstM = ['أحمد', 'محمد', 'سعيد', 'خالد', 'علي', 'حمد', 'سالم', 'ناصر', 'سيف', 'راشد', 'عبدالله', 'هلال', 'مازن', 'زياد', 'يزن', 'إياد', 'فارس', 'قيس'];
        $firstF = ['مريم', 'فاطمة', 'شيماء', 'آمنة', 'ريم', 'لجين', 'غلا', 'جنى', 'سارة', 'هند', 'ميار', 'رغد', 'بشرى', 'وعد'];
        $tribes = ['البلوشي', 'الحارثي', 'السيابي', 'الكندي', 'المعولي', 'الشحي', 'النعماني', 'البطاشي', 'الحسني', 'المعشني', 'الراسبي', 'الشبلي', 'العزري', 'الصوافي', 'القاسمي', 'الخروصي', 'الرشيدي', 'الفليتي', 'الحوسني', 'البريكي', 'المنذري', 'السناني', 'الهاشمي', 'المطاعني', 'الضامري', 'الغيلاني', 'التوبي', 'الوردي'];
        foreach ($tribes as $ti => $tribe) {
            $father = $firstM[($ti * 5) % count($firstM)];
            $kids = [];
            $n = 1 + ($ti % 3);
            for ($k = 0; $k < $n; $k++) {
                $female = ($ti + $k) % 2 === 1;
                $kids[] = [($female ? $firstF[($ti * 3 + $k) % count($firstF)].' بنت ' : $firstM[($ti * 7 + $k + 3) % count($firstM)].' بن ').$father.' '.($female ? $tribe.'ة' : $tribe), $female ? 'female' : 'male', ($ti * 3 + $k * 2) % 8];
            }
            $families[] = [$father.' بن '.$firstM[($ti + 9) % count($firstM)].' '.$tribe, (string) (60000000 + $ti * 3571), $kids];
        }
        $students = [];
        foreach ($families as $fi => [$gname, $gnid, $kids]) {
            $phone = '96891001'.str_pad((string) ($fi + 1), 3, '0', STR_PAD_LEFT);
            $guardian = Models\Guardian::create(['name' => $gname, 'national_id' => $gnid, 'nationality' => 'عماني', 'phone' => $phone, 'relation' => 'أب', 'job' => ['موظف حكومي', 'مهندس', 'طبيب', 'رجل أعمال', 'معلم', 'عسكري'][$fi % 6], 'address' => ['الخوض', 'المعبيلة', 'السيب', 'العذيبة', 'الموالح', 'الغبرة'][$fi % 6]]);
            if ($fi === 0) {
                $u = Models\User::create(['name' => $gname, 'email' => $phone.'@parent.local', 'phone' => $phone, 'role' => 'guardian', 'status' => 'active', 'password' => 'password']);
                $guardian->update(['user_id' => $u->id, 'email' => null]);
            }
            foreach ($kids as $ki => [$kname, $gender, $gi]) {
                $grade = $grades[$gi];
                $secs = $sections[$grade->id];
                $sec = $secs[($fi + $ki) % count($secs)];
                $status = in_array($fi, [16, 30, 41], true) ? 'pending' : 'active';
                $students[] = Models\Student::create([
                    'academic_year_id' => $yid, 'guardian_id' => $guardian->id, 'grade_id' => $grade->id, 'section_id' => $sec->id,
                    'bus_id' => ($fi + $ki) % 3 === 0 ? $buses[($fi) % 3]->id : null,
                    'student_no' => 'ST-'.str_pad((string) (count($students) + 1), 5, '0', STR_PAD_LEFT),
                    'name' => $kname, 'national_id' => (string) (20150000 + $fi * 101 + $ki * 11), 'gender' => $gender,
                    'birth_date' => Carbon::create(2021 - $gi, 1 + ($fi * 3 + $ki) % 12, 1 + ($fi * 7) % 27)->toDateString(),
                    'nationality' => 'عماني', 'status' => $status, 'registered_at' => Carbon::create(2026, 6, 1)->addDays($fi * 3 + $ki)->toDateString(),
                    'blood_type' => ['A+', 'O+', 'B+', 'AB+', 'O-'][($fi + $ki) % 5],
                ]);
            }
        }

        // ---------------------------------------------------------------- contracts + payments
        $cash = Models\CashAccount::where('type', 'cash')->first();
        $bank = Models\CashAccount::where('type', 'bank')->first();
        $bank->update(['name' => 'بنك مسقط — الحساب الجاري', 'bank_name' => 'بنك مسقط', 'account_no' => '0312004567890011', 'opening_balance' => 68500]);
        $cash->update(['opening_balance' => 2400]);
        $seq = 0;
        foreach ($students as $si => $st) {
            if ($st->status !== 'active' || $si % 9 === 8) {
                continue; // a few students without a contract yet
            }
            $tuition = Models\FeeItem::where('grade_id', $st->grade_id)->first();
            $items = [
                ['fee_item_id' => $tuition->id, 'name' => $tuition->name, 'amount' => (float) $tuition->amount],
                ['fee_item_id' => $regFee->id, 'name' => $regFee->name, 'amount' => 50],
                ['fee_item_id' => $books->id, 'name' => $books->name, 'amount' => 40],
            ];
            if ($st->bus_id) {
                $bus = $buses[array_search($st->bus_id, array_map(fn ($b) => $b->id, $buses))];
                $items[] = ['fee_item_id' => null, 'name' => 'رسوم الحافلة ('.$bus->number.')', 'amount' => (float) $bus->price];
            }
            $date = Carbon::create(2026, 6, 20)->addDays($si * 2);
            $c = new Models\Contract([
                'academic_year_id' => $yid, 'number' => 'SCH-2026-'.str_pad((string) (++$seq), 4, '0', STR_PAD_LEFT),
                'student_id' => $st->id, 'guardian_id' => $st->guardian_id, 'grade_id' => $st->grade_id, 'section_id' => $st->section_id, 'bus_id' => $st->bus_id,
                'date' => $date->toDateString(), 'discount_type' => $si % 4 === 1 ? 'fixed' : 'percent', 'discount_value' => $si % 4 === 1 ? 90 : ($si % 5 === 0 ? 10 : 0),
                'discount_reason' => $si % 4 === 1 ? 'خصم إخوة' : ($si % 5 === 0 ? 'خصم موظفين' : null), 'tax_rate' => 0,
                'installments_count' => [3, 4, 9, 10][$si % 4], 'first_due_date' => '2026-08-25', 'status' => 'draft', 'created_by' => $admin->id,
            ]);
            Finance::computeContract($c, $items);
            $c->save();
            foreach ($items as $it) {
                $c->items()->create($it);
            }
            Finance::buildInstallments($c);
            $c->status = 'active';
            $c->save();
            Finance::syncContract($c);

            // Pay some installments (leave others partial / overdue).
            $paidUpTo = [3, 2, 1, 0, 2, 3, 1][$si % 7];
            foreach ($c->installments()->orderBy('seq')->get() as $inst) {
                if ($inst->seq > $paidUpTo + ($si % 2) || $inst->due_date->gt(now()->addDays(12))) {
                    break;
                }
                $amt = ($si % 6 === 2 && $inst->seq === $paidUpTo) ? Finance::r((float) $inst->amount / 2) : (float) $inst->amount;
                Finance::payContract($c->fresh(), ['amount' => $amt, 'date' => $inst->due_date->copy()->addDays($si % 5)->min(now())->toDateString(), 'method' => $si % 3 === 2 ? 'cash' : 'bank', 'cash_account_id' => $si % 3 === 2 ? $cash->id : $bank->id]);
            }
        }
        // One draft contract waiting for activation.
        $draftStudent = collect($students)->first(fn ($s) => ! Models\Contract::where('student_id', $s->id)->exists() && $s->status === 'active');
        if ($draftStudent) {
            $tuition = Models\FeeItem::where('grade_id', $draftStudent->grade_id)->first();
            $c = new Models\Contract(['academic_year_id' => $yid, 'number' => 'SCH-2026-'.str_pad((string) (++$seq), 4, '0', STR_PAD_LEFT), 'student_id' => $draftStudent->id, 'guardian_id' => $draftStudent->guardian_id, 'grade_id' => $draftStudent->grade_id, 'section_id' => $draftStudent->section_id, 'date' => now()->toDateString(), 'installments_count' => 4, 'first_due_date' => now()->addMonth()->startOfMonth()->toDateString(), 'status' => 'draft', 'created_by' => $admin->id]);
            $items = [['fee_item_id' => $tuition->id, 'name' => $tuition->name, 'amount' => (float) $tuition->amount], ['fee_item_id' => $regFee->id, 'name' => $regFee->name, 'amount' => 50]];
            Finance::computeContract($c, $items);
            $c->save();
            foreach ($items as $it) {
                $c->items()->create($it);
            }
            Finance::buildInstallments($c);
        }

        // ---------------------------------------------------------------- attendance (last 12 school days, Sun–Thu)
        $day = now()->copy();
        $days = [];
        while (count($days) < 12) {
            if (! in_array($day->dayOfWeek, [Carbon::FRIDAY, Carbon::SATURDAY], true)) {
                $days[] = $day->toDateString();
            }
            $day->subDay();
        }
        foreach ($days as $di => $d) {
            foreach ($students as $si => $st) {
                if ($st->status !== 'active') {
                    continue;
                }
                $r = mt_rand(1, 100);
                $status = $r <= 86 ? 'present' : ($r <= 93 ? 'absent' : ($r <= 97 ? 'late' : 'excused'));
                Models\StudentAttendance::create(['academic_year_id' => $yid, 'student_id' => $st->id, 'section_id' => $st->section_id, 'date' => $d, 'status' => $status]);
            }
            foreach ($employees as $e) {
                $r = mt_rand(1, 100);
                $status = $r <= 90 ? 'present' : ($r <= 95 ? 'late' : ($r <= 98 ? 'absent' : 'leave'));
                Models\EmployeeAttendance::create(['employee_id' => $e->id, 'date' => $d, 'status' => $status,
                    'check_in' => $status === 'absent' || $status === 'leave' ? null : ($status === 'late' ? '07:'.(20 + mt_rand(0, 30)) : '06:'.(40 + mt_rand(0, 15))),
                    'check_out' => $status === 'absent' || $status === 'leave' ? null : '14:'.(mt_rand(0, 4) * 10)]);
            }
        }

        // ---------------------------------------------------------------- accounting
        $suppliers = [];
        foreach ([['مكتبة الأجيال للقرطاسية', 'حمد السعدي'], ['شركة النقل الحديث', 'سالم العلوي'], ['مؤسسة الصيانة المتكاملة', 'علي الراشدي'], ['شركة نماء للكهرباء والمياه', null]] as [$n, $p]) {
            $suppliers[] = Models\Supplier::create(['name' => $n, 'contact_person' => $p, 'phone' => '9682'.mt_rand(4000000, 4999999)]);
        }
        $cats = Models\ExpenseCategory::pluck('id', 'name');
        $palette = ['رواتب وأجور' => '#6366f1', 'إيجارات' => '#0ea5e9', 'كهرباء ومياه' => '#f59e0b', 'صيانة' => '#ef4444', 'قرطاسية ومستلزمات' => '#10b981', 'وقود ونقل' => '#8b5cf6', 'تسويق' => '#ec4899', 'أخرى' => '#64748b'];
        foreach ($palette as $n => $color) {
            Models\ExpenseCategory::where('name', $n)->update(['color' => $color]);
        }
        $expenseDefs = [
            ['إيجارات', null, 'إيجار مبنى المدرسة', 3500], ['كهرباء ومياه', 3, 'فاتورة الكهرباء والمياه', 380],
            ['وقود ونقل', 1, 'وقود الحافلات', 260], ['صيانة', 2, 'صيانة أجهزة التكييف', 175], ['قرطاسية ومستلزمات', 0, 'قرطاسية وأدوات صفية', 140],
        ];
        $expNo = 0;
        for ($m = 5; $m >= 0; $m--) {
            $month = now()->startOfMonth()->subMonthsNoOverflow($m);
            foreach ($expenseDefs as $k => [$cat, $sup, $desc, $amount]) {
                if ($m === 0 && $k > 2) {
                    continue;
                }
                $total = Finance::r($amount * (0.85 + mt_rand(0, 30) / 100));
                $e = Models\Expense::create(['number' => 'EXP-'.str_pad((string) (++$expNo), 6, '0', STR_PAD_LEFT), 'expense_category_id' => $cats[$cat], 'supplier_id' => $sup !== null ? $suppliers[$sup]->id : null, 'branch_id' => $mainBranch->id, 'date' => $month->copy()->addDays(2 + $k * 3)->toDateString(), 'description' => $desc.' — '.$month->format('m/Y'), 'amount' => $total, 'tax' => 0, 'total' => $total]);
                if (! ($m === 0 && $k === 2)) {
                    Finance::voucher('payment', ['date' => $e->date->toDateString(), 'amount' => $total, 'cash_account_id' => $k === 0 ? $bank->id : $cash->id, 'method' => $k === 0 ? 'bank' : 'cash', 'category' => 'expense', 'party_type' => $sup !== null ? 'supplier' : 'other', 'party_id' => $sup !== null ? $suppliers[$sup]->id : null, 'party_name' => $sup !== null ? $suppliers[$sup]->name : 'مالك المبنى', 'source_type' => 'expense', 'source_id' => $e->id, 'description' => 'سداد مصروف '.$e->number]);
                }
                Finance::syncExpense($e);
            }
        }

        $customers = [
            Models\Customer::create(['name' => 'نادي الشباب الرياضي', 'phone' => '96824123456', 'address' => 'الخوض']),
            Models\Customer::create(['name' => 'مركز الإبداع للتدريب', 'phone' => '96824654321', 'tax_number' => 'OM1100223344']),
            Models\Customer::create(['name' => 'جمعية المرأة العمانية', 'phone' => '96824778899']),
        ];
        foreach ([[0, 'تأجير الصالة الرياضية — 8 أيام', 8, 45, true], [1, 'تأجير قاعات دراسية لدورة صيفية', 1, 600, false], [2, 'تأجير المسرح لحفل سنوي', 1, 250, true]] as $k => [$ci, $desc, $qty, $price, $paid]) {
            $inv = Models\ServiceInvoice::create(['number' => 'INV-'.str_pad((string) ($k + 1), 6, '0', STR_PAD_LEFT), 'customer_id' => $customers[$ci]->id, 'customer_name' => $customers[$ci]->name, 'date' => now()->subDays(40 - $k * 15)->toDateString(), 'due_date' => now()->subDays(10 - $k * 15)->toDateString(), 'subtotal' => $qty * $price, 'total' => $qty * $price, 'status' => 'issued']);
            $inv->items()->create(['description' => $desc, 'qty' => $qty, 'price' => $price, 'total' => $qty * $price]);
            if ($paid) {
                Finance::voucher('receipt', ['date' => now()->subDays(30 - $k * 15)->toDateString(), 'amount' => $qty * $price, 'cash_account_id' => $bank->id, 'method' => 'bank', 'category' => 'service', 'party_type' => 'customer', 'party_id' => $customers[$ci]->id, 'party_name' => $customers[$ci]->name, 'source_type' => 'service_invoice', 'source_id' => $inv->id, 'description' => 'تحصيل فاتورة '.$inv->number]);
            }
            Finance::syncInvoice($inv);
        }
        Finance::voucher('receipt', ['date' => now()->subDays(12)->toDateString(), 'amount' => 120, 'cash_account_id' => $cash->id, 'category' => 'other', 'party_type' => 'other', 'party_name' => 'مقصف المدرسة', 'description' => 'إيراد تأجير المقصف — سبتمبر']);

        // ---------------------------------------------------------------- payroll (last 3 months paid)
        $adv = Models\EmployeeAdvance::create(['employee_id' => $employees[13]->id, 'date' => now()->subMonths(2)->startOfMonth()->toDateString(), 'amount' => 300, 'monthly_deduction' => 100, 'remaining' => 300, 'status' => 'active', 'notes' => 'سلفة ظرف طارئ']);
        Finance::voucher('payment', ['date' => now()->subMonths(2)->startOfMonth()->toDateString(), 'amount' => 300, 'cash_account_id' => $cash->id, 'category' => 'advance', 'party_type' => 'employee', 'party_id' => $employees[13]->id, 'party_name' => $employees[13]->name, 'source_type' => 'advance', 'source_id' => $adv->id, 'description' => 'سلفة موظف']);
        Models\EmployeeAdjustment::create(['employee_id' => $employees[4]->id, 'type' => 'bonus', 'title' => 'مكافأة تميّز', 'amount' => 100, 'month' => now()->subMonth()->format('Y-m')]);
        Models\EmployeeAdjustment::create(['employee_id' => $employees[11]->id, 'type' => 'deduction', 'title' => 'تأخير متكرر', 'amount' => 20, 'month' => now()->subMonth()->format('Y-m')]);
        Models\EmployeeAdjustment::create(['employee_id' => $employees[2]->id, 'type' => 'bonus', 'title' => 'إشراف نشاط', 'amount' => 50, 'month' => now()->format('Y-m')]);

        $payroll = app(\App\Http\Controllers\Api\Hr\PayrollController::class);
        for ($m = 3; $m >= 1; $m--) {
            $month = now()->startOfMonth()->subMonthsNoOverflow($m)->format('Y-m');
            $p = $payroll->generate(new \Illuminate\Http\Request(['month' => $month]))->getData();
            $payroll->approve(new \Illuminate\Http\Request, $p->id);
            $payroll->pay(new \Illuminate\Http\Request(['cash_account_id' => $bank->id, 'date' => Carbon::parse($month.'-01')->endOfMonth()->toDateString()]), $p->id);
        }

        $types = Models\LeaveType::pluck('id', 'name');
        foreach ([[3, 'سنوية', 5, 3, 'approved', 'سفر عائلي'], [6, 'مرضية', -2, 1, 'approved', 'مراجعة طبية'], [9, 'سنوية', 12, 4, 'pending', 'ظرف عائلي'], [12, 'طارئة', 3, 1, 'pending', 'أمر طارئ'], [14, 'سنوية', -20, 5, 'rejected', 'إجازة']] as [$ei, $t, $offset, $len, $status, $reason]) {
            Models\LeaveRequest::create(['employee_id' => $employees[$ei]->id, 'leave_type_id' => $types[$t], 'from_date' => now()->addDays($offset)->toDateString(), 'to_date' => now()->addDays($offset + $len - 1)->toDateString(), 'days' => $len, 'reason' => $reason, 'status' => $status, 'decided_by' => $status === 'pending' ? null : $admin->id]);
        }

        // ---------------------------------------------------------------- academics (subjects, terms, marks)
        $terms = [];
        foreach ([['الفصل الدراسي الأول', 40, 1], ['الفصل الدراسي الثاني', 40, 2], ['اختبارات نهاية العام', 20, 3]] as [$tn, $tw, $ts]) {
            $terms[] = Models\ExamTerm::create(['academic_year_id' => $yid, 'name' => $tn, 'weight' => $tw, 'sort' => $ts]);
        }
        // Common subjects for all grades + extras for the higher grades.
        $subjectDefs = [
            ['التربية الإسلامية', 'Islamic', null], ['اللغة العربية', 'Arabic', null], ['اللغة الإنجليزية', 'English', null],
            ['الرياضيات', 'Math', null], ['العلوم', 'Science', null], ['الدراسات الاجتماعية', 'Social', null],
            ['التربية الفنية', 'Art', null], ['التربية البدنية', 'PE', null], ['الحاسوب', 'ICT', null],
        ];
        $subjects = [];
        foreach ($subjectDefs as $i => [$sa, $se, $gid]) {
            $subjects[] = Models\Subject::create(['academic_year_id' => $yid, 'grade_id' => $gid, 'name_ar' => $sa, 'name_en' => $se, 'code' => strtoupper(substr($se, 0, 3)), 'max_mark' => 100, 'pass_mark' => 50, 'sort' => $i + 1]);
        }
        // Record marks for the first two terms (the final is still pending), for active students.
        foreach ($students as $si => $st) {
            if ($st->status !== 'active' || ! $st->section_id) {
                continue;
            }
            // Each student has a baseline ability; marks vary a bit per subject.
            $ability = 55 + ($si * 13) % 42; // 55..96
            foreach ($subjects as $sub) {
                if ($sub->grade_id && $sub->grade_id !== $st->grade_id) {
                    continue;
                }
                foreach ([$terms[0], $terms[1]] as $ti => $term) {
                    $base = $ability + (($si * 7 + $sub->id * 5 + $ti * 3) % 20) - 10; // ±10 jitter
                    $mark = max(20, min(100, $base));
                    Models\GradeMark::create([
                        'academic_year_id' => $yid, 'student_id' => $st->id, 'section_id' => $st->section_id, 'grade_id' => $st->grade_id,
                        'subject_id' => $sub->id, 'exam_term_id' => $term->id, 'mark' => $mark,
                    ]);
                }
            }
        }

        // ---------------------------------------------------------------- employee contracts + evaluations
        foreach ($employees as $i => $emp) {
            $type = $i < 2 ? 'permanent' : ($i % 4 === 0 ? 'fixed' : 'permanent');
            $end = $type === 'fixed' ? Carbon::parse($emp->hire_date)->addYears(2) : null;
            // Make a couple of fixed contracts expire soon for the dashboard alert.
            if ($i === 2) { $end = now()->addDays(20); }
            if ($i === 7) { $end = now()->addDays(8); }
            Models\EmployeeContract::create([
                'employee_id' => $emp->id,
                'number' => 'EC-2026-'.str_pad((string) ($i + 1), 4, '0', STR_PAD_LEFT),
                'type' => $type,
                'start_date' => $emp->hire_date,
                'end_date' => $end?->toDateString(),
                'basic_salary' => $emp->basic_salary,
                'allowances' => $emp->allowances(),
                'status' => 'active',
            ]);
        }
        $critDefs = [['الالتزام والانضباط', 20], ['الأداء المهني وجودة العمل', 30], ['التعاون والعمل الجماعي', 15], ['المبادرة والتطوير', 15], ['التواصل مع أولياء الأمور', 20]];
        $criteria = [];
        foreach ($critDefs as $ci => [$cn, $cw]) {
            $criteria[] = Models\EvaluationCriterion::create(['name' => $cn, 'weight' => $cw, 'max_score' => 100, 'sort' => $ci + 1]);
        }
        $period = Models\EvaluationPeriod::create(['name' => 'تقييم الفصل الدراسي الأول '.$current->name, 'from_date' => $current->start_date, 'to_date' => now()->toDateString(), 'status' => 'open']);
        Models\EvaluationPeriod::create(['name' => 'تقييم العام السابق', 'status' => 'closed']);
        foreach ($employees as $i => $emp) {
            if ($i % 3 === 2) { continue; } // leave some un-evaluated
            $base = 60 + ($i * 11) % 38;
            $weighted = 0;
            $wsum = array_sum(array_map(fn ($c) => (float) $c->weight, $criteria));
            $eval = Models\Evaluation::create(['employee_id' => $emp->id, 'period_id' => $period->id, 'evaluator_id' => $admin->id, 'date' => now()->toDateString(), 'total_score' => 0, 'grade' => '']);
            foreach ($criteria as $ci => $c) {
                $score = max(40, min(100, $base + (($i * 7 + $ci * 9) % 24) - 12));
                $eval->scores()->create(['criterion_id' => $c->id, 'score' => $score]);
                $weighted += ($score / (float) $c->max_score) * 100 * ((float) $c->weight / $wsum);
            }
            $g = \App\Support\Grading::grade(round($weighted, 2));
            $eval->update(['total_score' => round($weighted, 2), 'grade' => $g['letter']]);
        }

        // ---------------------------------------------------------------- timetable (first 3 sections)
        $school->update(['settings' => array_merge($school->settings ?? [], ['school_days' => [0, 1, 2, 3, 4], 'periods' => 7])]);
        $someSections = Models\Section::where('academic_year_id', $yid)->orderBy('id')->take(6)->get();
        foreach ($someSections as $sec) {
            $subs = $subjects; // all common subjects apply
            $ti = 0;
            foreach ([0, 1, 2, 3, 4] as $day) {
                for ($period = 1; $period <= 7; $period++) {
                    if ($period === 4) { // break slot
                        continue;
                    }
                    $sub = $subs[$ti % count($subs)];
                    $teacher = $teachers[($ti + $sec->id) % count($teachers)];
                    Models\TimetableEntry::create([
                        'academic_year_id' => $yid, 'section_id' => $sec->id, 'day' => $day, 'period' => $period,
                        'subject_id' => $sub->id, 'teacher_id' => $teacher->id, 'room' => $sec->room,
                    ]);
                    $ti++;
                }
            }
        }

        // ---------------------------------------------------------------- admin affairs
        $tasks = [
            ['تسليم الإقرار الضريبي الربع سنوي', 'urgent', 'done', 100, -60, -44, $finance->id],
            ['متابعة عرض السعر مع شركة الوثبة', 'important', 'in_progress', 75, -40, 0, $admin->id],
            ['تجديد عضوية غرفة التجارة', 'urgent', 'in_progress', 60, -37, 2, $admin->id],
            ['إعداد كشف رواتب الشهر', 'important', 'in_progress', 40, -4, 6, $hrUser->id],
            ['أرشفة عقود الطلاب للربع الثالث', 'normal', 'new', 0, -1, 14, $finance->id],
            ['جرد الأصول الثابتة للفرع الرئيسي', 'normal', 'new', 0, 5, 21, $admin->id],
            ['تجهيز حفل اليوم الوطني', 'important', 'new', 10, 3, 28, $hrUser->id],
            ['مراجعة خطة الإخلاء والسلامة', 'urgent', 'in_progress', 30, -10, -2, $admin->id],
        ];
        foreach ($tasks as [$t, $p, $s, $prog, $start, $end, $uid]) {
            Models\Task::create(['title' => $t, 'priority' => $p, 'status' => $s, 'progress' => $prog, 'start_date' => now()->addDays($start)->toDateString(), 'end_date' => now()->addDays($end)->toDateString(), 'branch_id' => $mainBranch->id, 'assigned_to' => $uid, 'created_by' => $admin->id]);
        }
        $ccat = Models\CorrespondenceCategory::pluck('id', 'name');
        foreach ([
            ['incoming', 'تعميم بشأن مواعيد الاختبارات النهائية', 'وزارة التربية والتعليم', 'وزارة التربية والتعليم', 'urgent', 'new', -2],
            ['incoming', 'طلب نقل طالب', 'ولي أمر الطالب حمد الكلباني', 'أولياء الأمور', 'normal', 'in_progress', -6],
            ['outgoing', 'طلب تجديد الترخيص المدرسي', 'المديرية العامة للتعليم الخاص', 'جهات حكومية', 'important', 'closed', -30],
            ['outgoing', 'طلب عرض سعر لصيانة الحافلات', 'شركة النقل الحديث', 'موردون', 'normal', 'closed', -15],
            ['internal', 'جدول المناوبات الأسبوعية', 'الهيئة التدريسية', 'داخلي', 'normal', 'new', -1],
            ['incoming', 'دعوة لحضور ملتقى المدارس الخاصة', 'غرفة تجارة وصناعة عمان', 'جهات حكومية', 'normal', 'new', -3],
        ] as $k => [$dir, $subj, $party, $cat, $prio, $st, $off]) {
            Models\Correspondence::create(['direction' => $dir, 'number' => Numbering::next(Models\Correspondence::class, ['incoming' => 'IN-', 'outgoing' => 'OUT-', 'internal' => 'INT-'][$dir].date('Y').'-', 4), 'date' => now()->addDays($off)->toDateString(), 'subject' => $subj, 'party' => $party, 'category_id' => $ccat[$cat], 'priority' => $prio, 'status' => $st, 'assigned_to' => $admin->id]);
        }
        foreach ([['ترخيص مزاولة نشاط تعليمي', 'MOE-2019-0456', 'وزارة التربية والتعليم', -340, 25, 150], ['السجل التجاري', '1234567', 'وزارة التجارة والصناعة', -200, 165, 80], ['شهادة الدفاع المدني', 'CD-88231', 'هيئة الدفاع المدني والإسعاف', -380, -15, 60], ['تصريح تشغيل الحافلات', 'TR-5521', 'شرطة عمان السلطانية', -100, 265, 45]] as [$n, $num, $iss, $from, $to, $cost]) {
            Models\License::create(['name' => $n, 'number' => $num, 'issuer' => $iss, 'issue_date' => now()->addDays($from)->toDateString(), 'expiry_date' => now()->addDays($to)->toDateString(), 'cost' => $cost]);
        }

        foreach ([['لين بنت هشام الحبسية', 'female', 0, 'هشام بن سعيد الحبسي', '96892223344'], ['عمر بن وليد المسكري', 'male', 2, 'وليد بن عمر المسكري', '96893334455'], ['تالا بنت أنور العجمية', 'female', 4, 'أنور بن تالب العجمي', '96894445566'], ['فيصل بن حسن البحري', 'male', 5, 'حسن بن فيصل البحري', '96895556677']] as $k => [$sn, $g, $gi, $gn, $gp]) {
            Models\Application::create(['academic_year_id' => $yid, 'student_name' => $sn, 'gender' => $g, 'grade_id' => $grades[$gi]->id, 'nationality' => 'عماني', 'birth_date' => Carbon::create(2021 - $gi, 3, 10)->toDateString(), 'guardian_name' => $gn, 'guardian_phone' => $gp, 'guardian_relation' => 'أب', 'previous_school' => $k % 2 ? 'مدرسة الأمل الخاصة' : null, 'source' => $k === 3 ? 'office' : 'online', 'status' => 'new']);
        }

        Models\CustomField::create(['entity' => 'student', 'label' => 'الحساسية الغذائية', 'key' => 'f_allergy', 'type' => 'text', 'sort' => 1]);
        Models\CustomField::create(['entity' => 'student', 'label' => 'المقاس (الزي)', 'key' => 'f_size', 'type' => 'select', 'options' => ['S', 'M', 'L', 'XL'], 'sort' => 2]);

        foreach ([['application', 'طلب تسجيل جديد', 'لين بنت هشام الحبسية — روضة أولى', '#/applications'], ['installment', 'أقساط متأخرة', 'يوجد أقساط مستحقة لم تُسدّد بعد', '#/installments?state=overdue'], ['license', 'ترخيص قارب على الانتهاء', 'ترخيص مزاولة نشاط تعليمي ينتهي خلال 25 يوماً', '#/licenses']] as [$t, $title, $body, $link]) {
            Models\AppNotification::create(['type' => $t, 'title' => $title, 'body' => $body, 'link' => $link]);
        }
        Models\Announcement::create(['company_id' => $school->id, 'title' => 'بدء الاختبارات القصيرة الأسبوع القادم', 'body' => 'نود إعلام أولياء الأمور بأن الاختبارات القصيرة للفصل الأول تبدأ يوم الأحد القادم.', 'audience' => 'all']);
        Models\Announcement::create(['company_id' => null, 'title' => 'مرحباً بكم في سكوول 🎉', 'body' => 'تمت إضافة بوابة ولي الأمر وتقارير الحضور الجديدة.', 'audience' => 'staff']);

        app()->forgetInstance('currentCompanyId');
    }
}
