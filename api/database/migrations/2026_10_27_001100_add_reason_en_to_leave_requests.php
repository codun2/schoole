<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        if (! Schema::hasColumn('leave_requests', 'reason_en')) {
            Schema::table('leave_requests', fn (Blueprint $t) => $t->string('reason_en')->nullable()->after('reason'));
        }
    }
    public function down(): void {
        if (Schema::hasColumn('leave_requests', 'reason_en')) {
            Schema::table('leave_requests', fn (Blueprint $t) => $t->dropColumn('reason_en'));
        }
    }
};
