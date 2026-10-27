<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        if (! Schema::hasColumn('employee_adjustments', 'title_en')) {
            Schema::table('employee_adjustments', fn (Blueprint $t) => $t->string('title_en')->nullable()->after('title'));
        }
    }
    public function down(): void {
        if (Schema::hasColumn('employee_adjustments', 'title_en')) {
            Schema::table('employee_adjustments', fn (Blueprint $t) => $t->dropColumn('title_en'));
        }
    }
};
