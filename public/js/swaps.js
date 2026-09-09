document.addEventListener('DOMContentLoaded', () => {
  // Initialize Socket.io connection if using real-time features
  const socket = io();
  let currentUser = null;

  // Get current user data if available
  try {
    const userElement = document.getElementById('userData');
    if (userElement) {
      currentUser = JSON.parse(userElement.dataset.user);
    }
  } catch (error) {
    console.error('Error parsing user data:', error);
  }

  // Handle swap request button clicks
  document.querySelectorAll('.request-swap').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const skillCard = e.target.closest('.skill-card');
      const skillId = skillCard.dataset.skillId;
      const userId = skillCard.dataset.userId;
      
      try {
        // Show loading state
        e.target.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Loading...';
        e.target.disabled = true;

        // Fetch user's skills to show in dropdown
        const response = await fetch('/api/users/me/skills');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const skills = await response.json();
        
        // Populate modal
        const modal = document.getElementById('swapModal');
        modal.querySelector('#recipientId').value = userId;
        modal.querySelector('#skillRequestedId').value = skillId;
        modal.querySelector('#requestedSkillName').textContent = 
          skillCard.querySelector('.skill-name').textContent;
        
        // Populate skills dropdown
        const skillSelect = modal.querySelector('#skillOfferedId');
        skillSelect.innerHTML = ''; // Clear existing options
        
        if (skills.length === 0) {
          skillSelect.innerHTML = '<option value="">No skills available to offer</option>';
          skillSelect.disabled = true;
        } else {
          skills.forEach(skill => {
            const option = document.createElement('option');
            option.value = skill._id;
            option.textContent = `${skill.name} (${skill.category})`;
            skillSelect.appendChild(option);
          });
        }

        // Initialize modal validation
        const swapForm = document.getElementById('swapForm');
        swapForm.classList.remove('was-validated');
        
        // Show modal
        new bootstrap.Modal(modal).show();
        
      } catch (err) {
        console.error('Error loading skills:', err);
        showToast('Error', 'Failed to load your skills', 'danger');
      } finally {
        // Reset button state
        e.target.innerHTML = '<i class="bi bi-arrow-repeat"></i> Request Swap';
        e.target.disabled = false;
      }
    });
  });

  // Handle swap form submission
  document.getElementById('swapForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const modal = bootstrap.Modal.getInstance(form.closest('.modal'));
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Validate form
    if (!form.checkValidity()) {
      e.stopPropagation();
      form.classList.add('was-validated');
      return;
    }

    const formData = {
      recipientId: form.querySelector('#recipientId').value,
      skillOfferedId: form.querySelector('#skillOfferedId').value,
      skillRequestedId: form.querySelector('#skillRequestedId').value,
      message: form.querySelector('#swapMessage').value,
      proposedTimes: [
        // Add any time selection logic here
      ]
    };

    try {
      // Show loading state
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Sending...';
      submitBtn.disabled = true;

      const response = await fetch('/api/swaps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || ''
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create swap');
      }

      // Show success message
      showToast('Success', 'Swap request sent successfully!', 'success');
      
      // Close modal
      if (modal) modal.hide();
      
      // Emit socket event if using real-time
      if (socket && currentUser) {
        socket.emit('swapRequest', {
          recipientId: formData.recipientId,
          senderName: currentUser.name,
          skillOffered: form.querySelector('#skillOfferedId option:checked').textContent,
          skillRequested: form.querySelector('#requestedSkillName').textContent
        });
      }

      // Refresh swap list after delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (error) {
      console.error('Error submitting swap:', error);
      showToast('Error', error.message || 'Failed to send swap request', 'danger');
    } finally {
      // Reset button state
      if (submitBtn) {
        submitBtn.innerHTML = 'Send Request';
        submitBtn.disabled = false;
      }
    }
  });

  // Handle swap response buttons
  document.querySelectorAll('.respond-swap').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const swapId = e.target.dataset.swapId;
      const action = e.target.dataset.action; // 'accept' or 'reject'
      
      try {
        e.target.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
        e.target.disabled = true;

        const response = await fetch(`/api/swaps/${swapId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || ''
          },
          body: JSON.stringify({
            status: action === 'accept' ? 'accepted' : 'rejected'
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to update swap status');
        }

        // Show success message
        showToast('Success', `Swap request ${action === 'accept' ? 'accepted' : 'rejected'}`, 'success');
        
        // Update UI without full reload
        const swapItem = document.getElementById(`swap-${swapId}`);
        if (swapItem) {
          swapItem.querySelector('.swap-status').textContent = 
            action === 'accept' ? 'Accepted' : 'Rejected';
          swapItem.querySelector('.swap-actions').remove();
        }

      } catch (error) {
        console.error('Error responding to swap:', error);
        showToast('Error', error.message || 'Failed to respond to swap', 'danger');
      } finally {
        e.target.innerHTML = action === 'accept' ? 'Accept' : 'Reject';
        e.target.disabled = false;
      }
    });
  });

  // Helper function to show toast notifications
  function showToast(title, message, variant = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = `toast-${Date.now()}`;
    const toastEl = document.createElement('div');
    
    toastEl.innerHTML = `
      <div id="${toastId}" class="toast align-items-center text-white bg-${variant} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body">
            <strong>${title}</strong>
            <div>${message}</div>
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    `;
    
    toastContainer.appendChild(toastEl);
    const toast = new bootstrap.Toast(document.getElementById(toastId));
    toast.show();
    
    // Remove toast after it hides
    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  }

  // Socket.io listeners for real-time updates
  if (socket && currentUser) {
    socket.on('newSwapRequest', (data) => {
      if (data.recipientId === currentUser._id) {
        showToast('New Swap Request', 
          `${data.senderName} wants to swap ${data.skillOffered} for your ${data.skillRequested}`,
          'primary');
        
        // Optionally refresh swap requests list
        if (document.getElementById('swapRequestsList')) {
          fetchSwapRequests();
        }
      }
    });

    socket.on('swapStatusUpdated', (data) => {
      if (data.requesterId === currentUser._id) {
        showToast('Swap Updated', 
          `Your swap request has been ${data.status}`,
          data.status === 'accepted' ? 'success' : 'warning');
        
        // Update UI if on swaps page
        if (document.getElementById(`swap-${data.swapId}`)) {
          const swapEl = document.getElementById(`swap-${data.swapId}`);
          swapEl.querySelector('.swap-status').textContent = 
            data.status === 'accepted' ? 'Accepted' : 'Rejected';
          swapEl.querySelector('.swap-actions')?.remove();
        }
      }
    });
  }
});

// Fetch and render swap requests (for recipient's dashboard)
async function fetchSwapRequests() {
  try {
    const response = await fetch('/api/swaps?status=pending&type=received');
    const data = await response.json();
    
    if (response.ok) {
      renderSwapRequests(data);
    } else {
      throw new Error(data.message || 'Failed to load swap requests');
    }
  } catch (error) {
    console.error('Error fetching swap requests:', error);
    showToast('Error', 'Failed to load swap requests', 'danger');
  }
}

function renderSwapRequests(swaps) {
  const container = document.getElementById('swapRequestsList');
  if (!container) return;
  
  container.innerHTML = swaps.length === 0 
    ? '<div class="text-muted">No pending swap requests</div>'
    : swaps.map(swap => `
      <div class="card mb-3" id="swap-${swap._id}">
        <div class="card-body">
          <h5 class="card-title">${swap.requester.name} wants to swap</h5>
          <p class="card-text">
            <span class="badge bg-primary">${swap.skillOffered.name}</span> 
            for your 
            <span class="badge bg-success">${swap.skillRequested.name}</span>
          </p>
          <div class="swap-status text-muted">Pending</div>
          <div class="swap-actions mt-2">
            <button class="btn btn-sm btn-success respond-swap" 
              data-swap-id="${swap._id}" data-action="accept">
              Accept
            </button>
            <button class="btn btn-sm btn-danger ms-2 respond-swap"
              data-swap-id="${swap._id}" data-action="reject">
              Reject
            </button>
          </div>
        </div>
      </div>
    `).join('');
}