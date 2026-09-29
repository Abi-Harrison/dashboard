import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from '@/pages/NowView/NowView.module.css';
import appStyles from '@/App.module.css';
import { useTimer } from '@/context/TimerContext.jsx';
import { getTodayDateString } from '@/utils/dateUtils';
import { Timestamp } from "firebase/firestore";

import demoTasks from '../../../data/demo-tasks.json';
import demoDailyMetrics from '../../../data/demo-dailyMetrics.json';
import demoMonthlyPlans from '../../../data/demo-monthlyPlans.json';
import demoAxes from '../../../data/demo-axes.json';

import Tooltip from '@/components/ui/Tooltip/Tooltip.jsx';
import ContextMap from '@/features/lifemap/ContextMap/ContextMap';
import Modal from '@/components/ui/Modal/Modal';
import BreakReviewForm from '@/features/physical/BreakReviewForm/BreakReviewForm';
import StudyFlashcardsModal from '@/features/gear/StudyFlashcardsModal/StudyFlashcardsModal';
import DearAbiMarquee from '@/components/ui/DearAbiMarquee/DearAbiMarquee';

const LS_KEYS = { CURRENT_TASK_ID: 'productivityApp_currentTaskId' };
const loadState = (key, defaultValue) => { try { const saved = localStorage.getItem(key); if (saved === null) return defaultValue; return saved; } catch (error) { console.error(`Error reading localStorage key “${key}”:`, error); return defaultValue; }};
const recurringRoutineDefinitions = { 'routine_am': { text: "Am Routine", axisTheme: "On Track N+1", assignedDays: [0, 1, 2, 3, 4, 5, 6] }, 'routine_pm': { text: "Pm Routine", axisTheme: "On Track N+1", assignedDays: [0, 1, 2, 3, 4, 5, 6] }, 'routine_famclean': { text: "Family Clean", axisTheme: "Environment", assignedDays: [0, 1, 2, 3, 4, 5, 6] }, 'routine_budget': { text: "Budget", axisTheme: "Financial", assignedDays: [2] }, 'routine_prepare': { text: "Prepare", axisTheme: "Rest and preparation", assignedDays: [0] }, 'routine_study': { text: "Study", axisTheme: "Gear", assignedDays: [0, 1, 2, 3, 4, 5, 6] }, 'routine_exercise': { text: "Exercise", axisTheme: "Physical", assignedDays: [0, 1, 2, 3, 4, 5, 6] }, 'routine_ready': { text: "Ready For Work", axisTheme: "Financial", assignedDays: [1, 2, 3, 4, 5] } };
const breakIdeas = ["Stretch for 5 minutes", "Walk around the block", "Get some water", "Listen to one song", "Doodle for 5 minutes (on paper!)", "Step outside for fresh air", "Quick tidy-up (1 area)", "Meditate for 5 minutes", "Read a non-work article",];
const TASK_ORDER_LS_KEY = 'nowViewTaskOrder';
const getTodayDayIndex = () => new Date().getDay();
const axisNameToCssVarSuffix = (axisName) => { if (!axisName || typeof axisName !== 'string') return 'default'; return axisName.trim().toLowerCase().replace(/\s+/g, '-').replace(/\+/g, '-plus-'); };

function NowViewDemo() {
    const { pomodoroDurationMinutes, timerSeconds, isTimerRunning, isTimerFinished, onSetPomodoroDurationMinutes, onSetTimerSeconds, onSetIsTimerRunning, onSetIsTimerFinished } = useTimer();
    const [currentTaskId, setCurrentTaskId] = useState(() => loadState(LS_KEYS.CURRENT_TASK_ID, null));
    useEffect(() => { if (currentTaskId !== null) { localStorage.setItem(LS_KEYS.CURRENT_TASK_ID, currentTaskId); } else { localStorage.removeItem(LS_KEYS.CURRENT_TASK_ID); } }, [currentTaskId]);

    const [tasks, setTasks] = useState([]);
    const [epiphanyCount, setEpiphanyCount] = useState(0);
    const [despairCount, setDespairCount] = useState(0);
    const [journalText, setJournalText] = useState('');
    const [isLoadingTasks, setIsLoadingTasks] = useState(true);
    const [adHocTaskText, setAdHocTaskText] = useState('');
    const [selectedAxisTheme, setSelectedAxisTheme] = useState('Rest and preparation');
    const [availableAxes, setAvailableAxes] = useState([]);
    const [focusAdHocInput, setFocusAdHocInput] = useState(false);
    const [epiphanyDetail, setEpiphanyDetail] = useState('');
    const [despairDetail, setDespairDetail] = useState('');
    const [isBreakModalOpen, setIsBreakModalOpen] = useState(false);
    const [currentBreakIdea, setCurrentBreakIdea] = useState('');
    const [timerFinishedAt, setTimerFinishedAt] = useState(null);
    const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);
    const [currentMonthTheme, setCurrentMonthTheme] = useState(null);
    const [productivityScore, setProductivityScore] = useState(0);
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);
    const adHocInputRef = useRef(null);

    const todayDateStr = getTodayDateString();
    const tasksForTodayDisplay = tasks.filter(task => !task.completed);
    const tasksToShowInDisplayBox = tasksForTodayDisplay.slice(0, 6);

    useEffect(() => { if (focusAdHocInput && adHocInputRef.current) { adHocInputRef.current.focus(); setFocusAdHocInput(false); } }, [focusAdHocInput]);
    useEffect(() => {
        setIsLoadingTasks(true);
        const axesList = demoAxes.new_axes.map(axis => ({ id: axis.id, name: axis.axisName })).filter(Boolean);
        setAvailableAxes(axesList);
        const today = new Date();
        const monthId = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const monthPlan = demoMonthlyPlans.monthlyPlans.find(plan => plan.id === monthId);
        if (monthPlan) { setCurrentMonthTheme(monthPlan.monthFocus); }
        const todayMetrics = demoDailyMetrics.dailyMetrics.find(metric => metric.id === todayDateStr);
        let initialTasksStatus = {};
        if (todayMetrics) {
            setEpiphanyCount(todayMetrics.epiphanyCount || 0);
            setDespairCount(todayMetrics.despairCount || 0);
            setProductivityScore(todayMetrics.productivityScore || 0);
            initialTasksStatus = todayMetrics.tasksStatus || {};
        }
        const tasksFromDemo = demoTasks.new_tasks.map(task => ({
            id: `task-${task.id}`, originalId: task.id, text: task.title,
            completed: task.status === 'completed', type: task.taskType,
            axisTheme: task.axisTheme, assignedDate: task.assignedDate,
        }));
        const todayDayIndex = getTodayDayIndex();
        const routinePlaceholdersForToday = [];
        for (const routineId in recurringRoutineDefinitions) {
            const definition = recurringRoutineDefinitions[routineId];
            if (definition.assignedDays.includes(todayDayIndex)) {
                routinePlaceholdersForToday.push({
                    id: routineId, originalId: null, text: definition.text,
                    completed: initialTasksStatus[routineId]?.completed || false,
                    type: 'recurring', axisTheme: definition.axisTheme, assignedDate: todayDateStr
                });
            }
        }
        const allTasksForToday = [...tasksFromDemo, ...routinePlaceholdersForToday];
        setTasks(allTasksForToday);
        setIsLoadingTasks(false);
    }, []);
    
    useEffect(() => {
      // This code runs only once when the demo component loads
      onSetPomodoroDurationMinutes(1);
      onSetTimerSeconds(60); // 60 seconds = 1 minute
    }, []); // The empty array ensures this only runs on the initial render

    useEffect(() => {
        const selectRandomBreak = () => breakIdeas[Math.floor(Math.random() * breakIdeas.length)];
        if (isTimerFinished && !isBreakModalOpen) {
            setCurrentBreakIdea(selectRandomBreak());
            setTimerFinishedAt(Timestamp.now());
            setIsBreakModalOpen(true);
        }
    }, [isTimerFinished, isBreakModalOpen]);

    const handleTaskToggle = (taskId, event) => { event.stopPropagation(); alert("This feature is disabled in the demo."); };
    const handleAddAdHocTask = () => alert("This feature is disabled in the demo.");
    const saveMoment = () => alert("This feature is disabled in the demo.");
    const incrementEpiphany = () => saveMoment();
    const incrementDespair = () => saveMoment();
    const handleJournalSave = () => alert("This feature is disabled in the demo.");
    const handleAssignedDateChange = () => alert("This feature is disabled in the demo.");
    const handleMomentKeyDown = (event) => { if (event.key === 'Enter') { event.preventDefault(); saveMoment(); }};
    const handleAdHocKeyDown = (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleAddAdHocTask(); } };
    const handleSetCurrentTask = (taskId) => {
        if (dragItem.current) return;
        setCurrentTaskId(taskId);
        setTasks(prevTasks => {
            const clickedIndex = prevTasks.findIndex(task => task.id === taskId);
            if (clickedIndex === -1 || clickedIndex === 0) return prevTasks;
            const newTasks = [...prevTasks];
            const [clickedItem] = newTasks.splice(clickedIndex, 1);
            newTasks.unshift(clickedItem);
            localStorage.setItem(TASK_ORDER_LS_KEY, JSON.stringify(newTasks.map(t => t.id)));
            return newTasks;
        });
    };
    const handleDragStart = (e, id) => { dragItem.current = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); e.currentTarget.classList.add(styles.dragging); };
    const handleDragEnter = (e, id) => { dragOverItem.current = id; e.currentTarget.classList.add(styles.dragOver); };
    const handleDragLeave = (e) => { e.currentTarget.classList.remove(styles.dragOver); };
    const handleDragOver = (e) => { e.preventDefault(); };
    const handleDrop = (e) => { e.preventDefault(); const draggedItemId = dragItem.current; const targetItemId = dragOverItem.current; e.currentTarget.classList.remove(styles.dragOver); if (!draggedItemId || !targetItemId || draggedItemId === targetItemId) { dragItem.current = null; dragOverItem.current = null; return; } setTasks(prevTasks => { const newTasks = [...prevTasks]; const dragIndex = newTasks.findIndex(task => task.id === draggedItemId); const targetIndex = newTasks.findIndex(task => task.id === targetItemId); if (dragIndex === -1 || targetIndex === -1) { console.error("Drag/drop index error."); return prevTasks; } const [draggedItemValue] = newTasks.splice(dragIndex, 1); newTasks.splice(targetIndex, 0, draggedItemValue); localStorage.setItem(TASK_ORDER_LS_KEY, JSON.stringify(newTasks.map(t => t.id))); return newTasks; }); dragItem.current = null; dragOverItem.current = null; };
    const handleDragEnd = (e) => { e.currentTarget.classList.remove(styles.dragging); document.querySelectorAll(`.${styles.dragOver}`).forEach(el => el.classList.remove(styles.dragOver)); dragItem.current = null; dragOverItem.current = null; };
    const handleStartPause = () => onSetIsTimerRunning(!isTimerRunning);
    const handleReset = () => { onSetIsTimerRunning(false); onSetIsTimerFinished(false); onSetTimerSeconds(pomodoroDurationMinutes * 60); };
    const formatTime = (seconds) => { const mins = Math.floor(seconds / 60); const secs = seconds % 60; return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`; };
    const handleDurationChange = (event) => { const newDuration = parseInt(event.target.value, 10); if (!isNaN(newDuration) && newDuration > 0) { onSetPomodoroDurationMinutes(newDuration); if (!isTimerRunning && !isTimerFinished) { onSetTimerSeconds(newDuration * 60); } } };
    const handleJournalChange = (event) => setJournalText(event.target.value);
    const closeBreakModal = () => { setIsBreakModalOpen(false); setCurrentBreakIdea(''); setTimerFinishedAt(null); onSetIsTimerFinished(false); handleReset(); };
    const handleBreakReviewSubmit = (breakLogData) => closeBreakModal();

    return (
        <div className={styles.nowViewContainer}>
            <div className={styles.demoTitleBlock}>
                <h2 className={styles.viewTitle}>Gearshift demo</h2>
                <p className={styles.demoBanner}>Portfolio preview with sample data. No login. Nothing here is written to an account.</p>
            </div>
            <div className={styles.leftPanel}>
                {/* This is the tooltip you were editing. You can safely change the text inside the quotes. */}
                <Tooltip text="By tracking key emotional moments (Epiphanies and Despairs), I can analyze how well my systems are working together and their impact on my mental state.">
                    <div className={styles.momentsTracker}>
                        <div className={styles.momentEntry}><div className={styles.momentCounter}><span>Epiphany: {epiphanyCount}</span><button onClick={incrementEpiphany} className={styles.momentButton}>+</button></div><input type="text" value={epiphanyDetail} onChange={(e) => setEpiphanyDetail(e.target.value)} onKeyDown={(e) => handleMomentKeyDown(e, 'epiphany')} placeholder="Epiphany detail..." className={styles.momentInput} /></div>
                        <div className={styles.momentEntry}><div className={styles.momentCounter}><span>Despair: {despairCount}</span><button onClick={incrementDespair} className={styles.momentButton}>+</button></div><input type="text" value={despairDetail} onChange={(e) => setDespairDetail(e.target.value)} onKeyDown={(e) => handleMomentKeyDown(e, 'despair')} placeholder="Despair detail..." className={styles.momentInput} /></div>
                    </div>
                </Tooltip>
                <Tooltip text="This score is a simple measure of daily completed tasks, providing a quick, at-a-glance metric for daily momentum."><div className={styles.productivityDisplay}>Productivity: <span className={styles.score}>{productivityScore}</span></div></Tooltip>
                <Tooltip text="This is for quickly recording distracting thoughts. By capturing them here, I can let go, knowing I can come back to them later without derailing my focus.">
                    <div className={styles.journalPlaceholder}>
                        <label htmlFor="nowJournal" className={styles.journalLabel}>Quick Thought:</label>
                        <textarea id="nowJournal" value={journalText} onChange={handleJournalChange} placeholder="Jot down quick thoughts..." rows="3" className={styles.journalTextarea} /><button onClick={handleJournalSave} disabled={!journalText.trim()} className={styles.saveJournalButton}>Save Thought</button>
                        <button type="button" onClick={() => setIsFlashcardModalOpen(true)} className={styles.flashcardButton} style={{ marginTop: '0.5rem', width: '100%' }} > Study Flashcards </button>
                    </div>
                </Tooltip>
            </div>
            <div className={styles.centerPanel}>
                    <div className={styles.taskListContainer}>
                        <h3 className={styles.sectionTitle}>Today's Tasks</h3>
                        <Tooltip text="This 'Focus' viewer shows the next few upcoming tasks, with the most immediate task displayed prominently to help maintain focus. As the user scrolls through or rearranges current tasks, the Focus viewer continues to display the upcoming tasks">
        
                        <div className={styles.currentTaskDisplay}>{isLoadingTasks && tasksToShowInDisplayBox.length === 0 && (<span className={styles.noTasksMessage}>Loading...</span>)}{!isLoadingTasks && tasksToShowInDisplayBox.length === 0 && (<span className={styles.noTasksMessage}>No tasks for today!</span>)}{tasksToShowInDisplayBox.map((task, index) => ( <div key={task.id} className={`${styles.upcomingTaskItem} ${styles[`upcomingTaskItem${index}`]}`}>{task.text}</div> ))}</div>
                        </Tooltip>
                        <Tooltip text="This is the main task list for the day, combining recurring routines and planned items.">
                        <div className={styles.taskList} >{isLoadingTasks ? (<p>Loading tasks...</p>) : tasksForTodayDisplay.length > 0 ? (tasksForTodayDisplay.map((task) => { const cssSuffix = axisNameToCssVarSuffix(task.axisTheme); const taskStyle = { '--task-color-dark': `var(--axis-color-${cssSuffix}-3, var(--axis-color-default-3))`, '--task-color-medium': `var(--axis-color-${cssSuffix}-2, var(--axis-color-default-2))`, '--task-color-light': `var(--axis-color-${cssSuffix}-1, var(--axis-color-default-1))` }; const assignedDateValue = task.assignedDate || ''; return ( <div key={task.id} className={`${styles.taskItem} ${task.completed ? styles.completedTask : ''} ${task.id === currentTaskId ? styles.selectedTask : ''}`} title={`${task.text}${task.axisTheme ? `\nAxis: ${task.axisTheme}` : ''}`} style={taskStyle} draggable={!task.completed} onDragStart={(e) => !task.completed && handleDragStart(e, task.id)} onDragEnter={(e) => !task.completed && handleDragEnter(e, task.id)} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={(e) => !task.completed && handleDrop(e)} onDragEnd={handleDragEnd} onClick={() => !task.completed && handleSetCurrentTask(task.id)}><div className={styles.checkboxContainer} onClick={(e) => e.stopPropagation()}><input type="checkbox" id={`task-checkbox-${task.id}`} checked={task.completed} onChange={(e) => handleTaskToggle(task.id, e)} className={styles.checkbox} /><label htmlFor={`task-checkbox-${task.id}`} className={styles.checkboxCustom}></label></div><label className={styles.taskLabel}>{task.text}</label>{task.type !== 'recurring' && ( <input type="date" className={styles.dueDateInput} value={assignedDateValue} onChange={(e) => handleAssignedDateChange(task.id, e.target.value)} onClick={(e) => e.stopPropagation()} title={`Assigned: ${assignedDateValue || 'Not set'}`} disabled={task.completed} /> )}</div> ); })) : ( <p>No tasks assigned for today.</p> )}</div>
                        </Tooltip>
                    </div>
                <Tooltip text="New, unplanned tasks can be added here and assigned to a specific life Axis.">
                    <div className={styles.adHocForm}>
                        <h4 className={styles.adHocTitle}>Add Task</h4>
                        <textarea ref={adHocInputRef} rows="2" placeholder="Enter new task..." value={adHocTaskText} onChange={(e) => setAdHocTaskText(e.target.value)} onKeyDown={handleAdHocKeyDown} className={styles.adHocTextarea} />
                        <div className={styles.adHocControls}><select value={selectedAxisTheme} onChange={(e) => setSelectedAxisTheme(e.target.value)} className={styles.adHocSelect} disabled={availableAxes.length === 0} ><option value="" disabled={selectedAxisTheme !== ""}>Select Axis</option>{availableAxes.map(axis => (<option key={axis.id} value={axis.name}>{axis.name}</option>))}</select><button onClick={handleAddAdHocTask} disabled={!adHocTaskText.trim() || !selectedAxisTheme || availableAxes.length === 0} className={styles.adHocButton} >Add Task</button></div>
                    </div>
                </Tooltip>
                <Tooltip text="This Context Map ensures ad-hoc tasks align with future goals. Upcoming goals appear smaller, growing larger as they get closer, providing constant perspective. The context map changes depending on the selected axis"><ContextMap axisName={selectedAxisTheme} /></Tooltip>
            </div>
            <div className={styles.rightPanel}>
                <Tooltip text="After each Pomodoro cycle, a survey appears to log data on focus and energy. This data is used for later analysis to find the ideal work-to-rest ratio.">
                    <div className={styles.timerSection}>
                                        <p className={styles.timeLabel}>What time is it?</p>
                                        <div className={styles.timerDisplay}>
                                            <img src={isTimerFinished ? "/tomato-sliced.png" : "/tomato-whole.png"} alt={isTimerFinished ? "Sliced Tomato - Time for a break!" : "Whole Tomato - Focus time"} className={styles.tomatoImage} onError={(e) => { e.target.style.display = 'none'; }} />
                                            <span className={styles.timerText}>{formatTime(timerSeconds)}</span>
                                        </div>
                                        <div className={styles.timerControls}>
                                            <button onClick={handleStartPause} className={styles.timerButton} disabled={isTimerFinished}>{isTimerRunning ? '❚❚' : '▶'}</button>
                                            <button onClick={handleReset} className={styles.timerButton}>⟳</button>
                                        </div>
                                        <div className={styles.timerConfig}>
                                            <label htmlFor="pomodoroDurationInput" className={styles.durationLabel}>Duration (min):</label>
                                            <input id="pomodoroDurationInput" type="number" value={pomodoroDurationMinutes} onChange={handleDurationChange} min="1" className={styles.durationInput} disabled={isTimerRunning} />
                                        </div>
                                        <p className={styles.nowLabel}>NOW</p>
                                    </div>
                </Tooltip>
                
                <Tooltip text="Messages from a more zoomed-out me and quotes I have selected to inspire in the moment."><div className={styles.timerSection}><DearAbiMarquee theme={currentMonthTheme} /></div></Tooltip>
                <div className={styles.tourNavigation}>
                <Link to="/contact" className={appStyles.tourButton}>Finish Tour & View Links</Link>
            </div>
            </div>
            
            {isBreakModalOpen && (<Modal isOpen={isBreakModalOpen} onClose={closeBreakModal}> <BreakReviewForm onSubmit={handleBreakReviewSubmit} onClose={closeBreakModal} pomodoroDuration={pomodoroDurationMinutes} timerFinishedTimestamp={timerFinishedAt} currentTask={tasks.find(t => t.id === currentTaskId)} /> </Modal>)}
            {isFlashcardModalOpen && (<StudyFlashcardsModal isOpen={isFlashcardModalOpen} onClose={() => setIsFlashcardModalOpen(false)} />)}
            
        </div>
    );
}

export default NowViewDemo;